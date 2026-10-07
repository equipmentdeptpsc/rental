import type {
  RentalBillingMethod,
  RentalCommercialSnapshot,
} from "@/features/rental/types";
import type { MaintenanceType } from "@/features/equipment/types";
import { meterRequirementForMaintenanceType } from "@/features/equipment/services/maintenanceMeterPolicy";

export type DeurMeterRequirementKind =
  | "none"
  | "odometer"
  | "hourMeter"
  | "both";

export interface DeurMeterRequirement {
  kind: DeurMeterRequirementKind;
  source: "frozen-snapshot" | "maintenance-type" | "billing-method" | "explicit-commercial-term" | "not-required";
  reason: string;
}

export function getDeurMeterRequirement(input: {
  billingMethod?: RentalBillingMethod | string;
  commercialTerms?: Pick<
    RentalCommercialSnapshot,
    "billingMethod" | "meterEvidenceRequirement"
  >;
  equipmentMeterCapability?: "odometer" | "hourMeter" | "both" | "none";
  maintenanceType?: MaintenanceType;
  frozenMeterRequirement?: DeurMeterRequirementKind;
}): DeurMeterRequirement {
  if (input.frozenMeterRequirement !== undefined) return { kind: input.frozenMeterRequirement, source: "frozen-snapshot", reason: "The frozen DEUR expectation remains authoritative." };
  const maintenance = meterRequirementForMaintenanceType(input.maintenanceType);
  if (maintenance !== undefined) return { kind: maintenance, source: "maintenance-type", reason: `Equipment Maintenance Type requires ${maintenance} meter behavior.` };
  const method = input.commercialTerms?.billingMethod ?? input.billingMethod;
  const explicit = input.commercialTerms?.meterEvidenceRequirement;

  if (explicit) {
    return {
      kind: explicit,
      source: "explicit-commercial-term",
      reason: `Commercial terms explicitly require ${explicit} meter evidence.`,
    };
  }

  if (method === "Per Kilometer") {
    return {
      kind: "odometer",
      source: "billing-method",
      reason: "Per Kilometer billing requires beginning and ending odometer evidence.",
    };
  }

  return {
    kind: "none",
    source: "not-required",
    reason:
      method === "Per Trip" || method === "One Lot"
        ? `${method} billing has no explicit meter-evidence requirement.`
        : `${method ?? "The current billing method"} uses non-meter DEUR evidence.`,
  };
}
