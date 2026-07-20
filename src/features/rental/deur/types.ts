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

export interface DeurOperationalCodeSnapshot {
  id?: string;
  code: string;
  name: string;
}

export interface DeurWorkDescriptionSnapshot {
  id?: string;
  code?: string;
  name: string;
  requiresRemarks: boolean;
}

export interface DeurOperationalMetadataSnapshot {
  costCode?: DeurOperationalCodeSnapshot;
  activityCode?: DeurOperationalCodeSnapshot;
  workDescription?: DeurWorkDescriptionSnapshot;
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

  creationSource?: DeurCreationSource;
  manualMetadata?: ManualDeurMetadata;

  evidenceMode?: DeurEvidenceMode;
  billingMethodSnapshot?: string;
  commercialSnapshot?: import("../types").RentalCommercialSnapshot;
  commercialSnapshotRequired?: boolean;
  revision?: DeurRevisionMetadata;
  odometerTripEvidence?: DeurOdometerTripEvidence;
  quantityEvidence?: DeurQuantityEvidence;
  completionEvidence?: DeurCompletionEvidence;

  /** Immutable operational values captured when this DEUR was created. */
  operationalMetadata?: DeurOperationalMetadataSnapshot;

  /** Work-specific remarks captured with the Work Description selection. */
  operationalRemarks?: string;

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

  rejectedByUserId?: string;

  rejectionReason?: string;

  reviewHistory?: DeurReviewHistoryEntry[];

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

export type DeurCreationSource = "OPERATOR_DIGITAL" | "RENTAL_COMPANY_MANUAL";
export type DeurCorrectionReasonCode="INCORRECT_TIME_ENTRY"|"MISSING_TIME_ENTRY"|"INCORRECT_ACTIVITY"|"INCORRECT_WORK_DESCRIPTION"|"INCORRECT_COST_CODE"|"INCORRECT_ODOMETER"|"INCORRECT_TRIP_CHECKPOINT"|"INCORRECT_QUANTITY"|"INCORRECT_OPERATOR"|"INCORRECT_PROJECT"|"INCORRECT_EQUIPMENT"|"INCORRECT_COMMERCIAL_REFERENCE"|"CUSTOMER_REQUESTED_CORRECTION"|"DATA_ENCODING_ERROR"|"OTHER";
export interface DeurRevisionMetadata{chainId:string;revisionNumber:number;originalDeurId:string;previousRevisionId?:string;correctionReasonCode?:DeurCorrectionReasonCode;correctionReasonDetails?:string;correctedByName?:string;correctedByUserId?:string;correctedAt?:string;supersedesRevisionId?:string;supersededByRevisionId?:string;supersededAt?:string;supersededByName?:string}
export type DeurEvidenceMode = "TIME_TIMELINE" | "ODOMETER_TRIP" | "QUANTITY" | "COMPLETION";
export interface DeurOdometerCheckpoint { id:string;location:string;odometerReading:number;recordedAt?:string;remarks?:string }
export interface DeurTripSegment { id:string;startCheckpointId:string;endCheckpointId:string;startLocation:string;endLocation:string;departureAt?:string;arrivalAt?:string;startOdometer:number;endOdometer:number;distance:number;remarks?:string }
export interface DeurOdometerTripEvidence { checkpoints:DeurOdometerCheckpoint[];segments:DeurTripSegment[];startingOdometer?:number;endingOdometer?:number;totalDistance:number;tripCount:number }
export interface DeurQuantityEvidence { quantity:number;unit:"CUBIC_METER";remarks?:string;reference?:string }
export interface DeurCompletionEvidence { status:"IN_PROGRESS"|"COMPLETED";completedAt?:string;remarks?:string;reference?:string }
export type ManualDeurReason =
  | "POWER_NOT_AVAILABLE" | "SITE_COMPUTER_NOT_AVAILABLE" | "TECHNICAL_DIFFICULTY"
  | "DEVICE_MALFUNCTION" | "OPERATOR_DEVICE_NOT_ISSUED" | "APPLICATION_UNAVAILABLE"
  | "INTERNET_UNAVAILABLE" | "DELAYED_DIGITAL_DEPLOYMENT"
  | "PHYSICAL_DEUR_USED_AS_BACKUP" | "OTHER";
export interface ManualDeurMetadata {
  reason: ManualDeurReason;
  reasonDetails?: string;
  encodedByUserId?: string;
  encodedByName: string;
  encodedAt: string;
  physicalDeurReference: string;
  sourceDocumentDate?: string;
  operatorConfirmed: boolean;
  operatorConfirmedAt?: string;
  operatorConfirmedByName?: string;
  remarks?: string;
}

export type DeurActivityTypeCanonical = "shift" | "operation" | "idle" | "mealBreak" | "breakdown";
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
  breakdownMinutes: number;
}

export interface DeurReviewHistoryEntry { action: "submitted" | "acknowledged" | "rejected" | "reopened"; actorName: string; actorId?: string; timestamp: string; reason?: string; }
