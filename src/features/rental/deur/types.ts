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

  rentalId: string;

  assignmentId?: string;

  equipmentId: string;

  operatorId: string;

  projectId?: string;

  customerId?: string;

  workDate: string;

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

  acknowledgedAt?: string;

  acknowledgementRemarks?: string;

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
