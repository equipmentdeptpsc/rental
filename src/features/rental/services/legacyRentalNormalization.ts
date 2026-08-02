export type LegacyRentalNormalizationReasonCode =
  | "NOT_FOUND" | "UNAUTHORIZED" | "TENANT_NOT_ALLOWED" | "NOT_LEGACY_RENTAL"
  | "RENTAL_STATUS_NOT_ELIGIBLE" | "ALREADY_NORMALIZED" | "SOURCE_DATA_INCOMPLETE"
  | "LINE_IDENTITY_INVALID" | "ASSIGNMENT_INVALID" | "OPERATOR_INVALID" | "PROJECT_INVALID"
  | "EQUIPMENT_INVALID" | "CUSTOMER_INVALID" | "DEUR_POLICY_MISSING" | "SHIFT_EXPECTATION_MISSING"
  | "SHIFT_WINDOW_INVALID" | "WORK_DESCRIPTION_MISSING" | "METER_CONFIGURATION_INVALID"
  | "COMMERCIAL_SNAPSHOT_MISSING" | "DRAFT_DEUR_INCOMPATIBLE" | "SUBMITTED_DEUR_EXISTS"
  | "CUSTOMER_REVIEW_EXISTS" | "MANAGER_OUTCOME_EXISTS" | "BILLING_EVIDENCE_EXISTS"
  | "INVOICE_OR_COLLECTION_EXISTS" | "RECOVERY_EVIDENCE_EXISTS" | "RETURNED_OR_CLOSED_RENTAL"
  | "ACCEPTED_DOWNSTREAM_EVIDENCE" | "CONFLICT";
export interface LegacyNormalizationLineResult {
  rentalEquipmentLineId: string; snapshotPresent: boolean; eligible: boolean;
  reasonCodes: LegacyRentalNormalizationReasonCode[]; evidence: Readonly<Record<string, boolean>>;
}
export interface LegacyRentalNormalizationEligibility {
  eligible: boolean; rentalId: string; rentalStatus?: string; normalizationRequired: boolean;
  alreadyNormalized: boolean; lineResults: LegacyNormalizationLineResult[];
  incompleteLines: LegacyNormalizationLineResult[]; reasonCodes: LegacyRentalNormalizationReasonCode[];
  downstreamEvidence: Readonly<Record<string, boolean>>; expectedVersion?: number; currentVersion?: number;
}
