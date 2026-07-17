export type DeurActivityType =
  | "Arrived at Site"
  | "Operation"
  | "Idle"
  | "Meal Break"
  | "Corrective Maintenance"
  | "Preventive Maintenance"
  | "Demobilization";

export type DeurStatus =
  | "Draft"
  | "In Progress"
  | "Submitted"
  | "Pending Acknowledgement"
  | "Acknowledged"
  | "Rejected"
  | "Billed";

export interface DeurActivityLog {
  id: string;

  activity: DeurActivityType;

  startTime: string;

  endTime?: string;

  durationMinutes: number;

  remarks?: string;
}

export interface DeurRecord {
  id: string;

  deurNumber?: string;

  rentalId: string;

  assignmentId?: string;

  equipmentId: string;

  operatorId: string;

  projectId?: string;

  customerId?: string;

  workDate: string;

  reportDate?: string;

  events?: CanonicalDeurEvent[];

  totals?: DeurTotals;

  legacy?: boolean;

  submittedAt?: string;

  submittedBy?: string;

  shift?: "Day" | "Night";

  logs: DeurActivityLog[];

  startOfDay?: string;

  endOfDay?: string;

  openingMeter?: number;

  closingMeter?: number;

  totalOperatingMinutes: number;

  totalIdleMinutes: number;

  totalMaintenanceMinutes: number;

  totalMealBreakMinutes: number;

  totalMobilizationMinutes: number;

  totalDemobilizationMinutes: number;

  status: DeurStatus;

  acknowledgedBy?: string;

  acknowledgedByUserId?: string;

  acknowledgedAt?: string;

  acknowledgementRemarks?: string;

  rejectedAt?: string;

  rejectedBy?: string;

  rejectionReason?: string;

  billId?: string;

  /**
   * Prevents duplicate billing.
   */
  billingLocked?: boolean;

  /**
   * Billing Statement that owns this DEUR.
   */
  billingStatementId?: string;

  createdAt: string;

  updatedAt: string;
}

export type DeurActivityTypeCanonical = "shift" | "operation" | "idle" | "mealBreak";
export type DeurEventAction = "start" | "end";

export interface CanonicalDeurEvent {
  id: string;
  activityType: DeurActivityTypeCanonical;
  action: DeurEventAction;
  timestamp: string;
  sequence: number;
  source: "user" | "automatic" | "legacy";
  actionGroupId?: string;
  logicalActionId?: string;
  actorId?: string;
  actorName?: string;
  createdOffline?: boolean;
  localCreatedAt?: string;
}

export interface DeurTotals {
  shiftMinutes: number;
  operationMinutes: number;
  idleMinutes: number;
  mealBreakMinutes: number;
}
