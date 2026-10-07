import type { DeurMeterRequirementKind } from "../services/getDeurMeterRequirement";

export function operatorMeterPresentation(kind: DeurMeterRequirementKind) {
  return {
    showAutomaticHourMeter: kind === "hourMeter" || kind === "both",
    showOdometerCheckpoint: kind === "odometer" || kind === "both",
  };
}
