import type { OperationalCommandMetadata, OperationalCommandResult } from "./contracts";

export type RentalPreparationMeterRequirement = "none" | "odometer" | "hourMeter" | "both";

export interface RentalPreparationCommercialTerms {
  billingMethod: "Per Hour" | "Per Day" | "Per Week" | "Per Month" | "Per Trip" | "Per Kilometer" | "Per Cubic Meter" | "One Lot" | "Per Lot";
  unitRate: number; minimumBillableHours?: number; overtimeRate?: number; standbyRate?: number;
  mobilizationFee?: number; demobilizationFee?: number; fuelCharge?: number;
  operatorIncluded: boolean; operatorRate?: number; taxRate?: number; withholdingTax?: number;
  contractAmount?: number; currency: string;
}

export interface RentalPreparationShiftWindow {
  code: "DAY" | "NIGHT"; label: string; startTime: string; endTime: string; timezone: string;
}

export interface PrepareReservedRentalCommand extends OperationalCommandMetadata {
  rentalId: string; lineId: string; expectedVersion: number;
  commercialTerms: RentalPreparationCommercialTerms;
  costCodeId: string; activityCodeId: string; workDescriptionId: string;
  operationalRemarks?: string;
  deurPolicy: { frequency: "PER_WORKDAY" | "PER_SHIFT" | "ON_DEMAND"; effectiveFrom: string };
  shiftWindows: readonly RentalPreparationShiftWindow[];
  workDate: string; meterRequirement: RentalPreparationMeterRequirement;
}

export interface AggregateRentalPreparationLineInput {
  lineId: string;
  commercialTerms: RentalPreparationCommercialTerms;
  costCodeId: string; activityCodeId: string; workDescriptionId: string;
  operationalRemarks?: string;
  deurPolicy: { frequency: "PER_WORKDAY" | "PER_SHIFT" | "ON_DEMAND"; effectiveFrom: string };
  shiftWindows: readonly RentalPreparationShiftWindow[];
  workDate: string; meterRequirement: RentalPreparationMeterRequirement;
}

export interface PrepareReservedRentalAggregateCommand extends OperationalCommandMetadata {
  rentalId: string;
  expectedRentalVersion: number;
  lines: readonly AggregateRentalPreparationLineInput[];
}

export interface RentalPreparationProjection {
  rentalId: string; lineId: string; status: "Reserved"; version: number; releaseReady: true;
}

export interface AggregateRentalPreparationLineProjection {
  lineId: string; assignmentId: string; equipmentId: string; operatorId: string;
  sourceFingerprint: string; version: number;
}

export interface AggregateRentalPreparationProjection {
  rentalId: string; companyId: string; status: "Reserved"; version: number;
  preparedLineCount: number; releaseReady: true;
  lines: readonly AggregateRentalPreparationLineProjection[];
}

export interface RentalPreparationCommandRepository {
  prepareReservedRental(command: PrepareReservedRentalCommand): Promise<OperationalCommandResult<RentalPreparationProjection>>;
  prepareReservedRentalAggregate(command: PrepareReservedRentalAggregateCommand): Promise<OperationalCommandResult<AggregateRentalPreparationProjection>>;
}
