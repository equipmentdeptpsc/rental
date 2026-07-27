import type { RentalApprovalStatus, RentalBillingMethod, RentalType } from "../types";

export interface ManagerApprovalEquipmentSnapshot {
  equipmentCode: string;
  equipmentName: string;
  assetNumber: string;
  assignedOperator: string;
  quantity: number;
}

export interface ManagerApprovalCommercialSnapshot {
  equipmentCode: string;
  billingMethod: RentalBillingMethod | "Not configured";
  unitRate?: number;
  contractAmount?: number;
  vatIncluded: boolean;
  fuelIncluded: boolean;
  operatorIncluded: boolean;
  commercialTermsConfigured: boolean;
  commercialSnapshotLocked: boolean;
  currency: string;
  summary?: import("../commercial/resolveCommercialSummary").CommercialSummaryRow[];
}

export interface ManagerApprovalEmailSnapshot {
  rentalNumber: string;
  customer: string;
  project: string;
  rentalType: RentalType | "Not specified";
  rentalPeriod: string;
  requestedBy: string;
  requestedDate: string;
  currentStatus: string;
  approvalStatus: RentalApprovalStatus;
  equipment: ManagerApprovalEquipmentSnapshot[];
  commercial: ManagerApprovalCommercialSnapshot[];
  readiness: {
    assignmentComplete: boolean;
    commercialTermsComplete: boolean;
    equipmentAvailable: boolean;
    operatorAssigned: boolean;
    conflictsDetected: boolean;
    expectedReleaseDate: string;
  };
  warnings: string[];
}

export type DevelopmentApprovalEmailStatus = "Pending" | "Approved" | "Rejected" | "Expired" | "Consumed";

export interface DevelopmentApprovalEmail {
  id: string;
  recipientName: string;
  recipient: string;
  subject: string;
  generatedAt: string;
  rentalId: string;
  rentalNumber: string;
  approvalToken: string;
  expiresAt: string;
  status: DevelopmentApprovalEmailStatus;
  snapshot: ManagerApprovalEmailSnapshot;
  html: string;
  decisionAt?: string;
}
