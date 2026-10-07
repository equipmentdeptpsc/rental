import type { DeurRecord } from "../types";

/**
 * The client-side equivalent of erp.canonical_deur_meter_evidence.  All web
 * evidence consumers use this projection instead of guessing from aliases.
 */
export function canonicalMeterEvidence(deur: Pick<DeurRecord,
  "meterRequirement" | "openingHourMeter" | "closingHourMeter" |
  "openingOdometer" | "closingOdometer" | "openingMeter" | "closingMeter"
>) {
  const meterRequirement = deur.meterRequirement ?? "none";
  const explicit = deur.openingHourMeter !== undefined || deur.closingHourMeter !== undefined
    || deur.openingOdometer !== undefined || deur.closingOdometer !== undefined;
  const legacyAmbiguous = meterRequirement === "both" && !explicit
    && (deur.openingMeter !== undefined || deur.closingMeter !== undefined);
  const openingHourMeter = deur.openingHourMeter ?? (meterRequirement === "hourMeter" ? deur.openingMeter : undefined);
  const closingHourMeter = deur.closingHourMeter ?? (meterRequirement === "hourMeter" ? deur.closingMeter : undefined);
  const openingOdometer = deur.openingOdometer ?? (meterRequirement === "odometer" ? deur.openingMeter : undefined);
  const closingOdometer = deur.closingOdometer ?? (meterRequirement === "odometer" ? deur.closingMeter : undefined);
  return {
    meterRequirement, openingHourMeter, closingHourMeter, openingOdometer, closingOdometer,
    openingMeter: meterRequirement === "hourMeter" ? openingHourMeter : meterRequirement === "odometer" ? openingOdometer : undefined,
    closingMeter: meterRequirement === "hourMeter" ? closingHourMeter : meterRequirement === "odometer" ? closingOdometer : undefined,
    ...(legacyAmbiguous ? { legacyMeterEvidenceState: "LEGACY_AMBIGUOUS_DUAL_METER" as const } : {}),
  };
}

export function deurShiftDistanceKilometers(deur: Pick<DeurRecord,
  "meterRequirement" | "openingHourMeter" | "closingHourMeter" | "openingOdometer" | "closingOdometer" | "openingMeter" | "closingMeter" | "odometerTripEvidence"
>): number | undefined {
  if (deur.odometerTripEvidence?.totalDistance !== undefined) return deur.odometerTripEvidence.totalDistance;
  const evidence = canonicalMeterEvidence(deur);
  if (evidence.openingOdometer === undefined || evidence.closingOdometer === undefined) return undefined;
  return Math.max(0, evidence.closingOdometer - evidence.openingOdometer);
}
