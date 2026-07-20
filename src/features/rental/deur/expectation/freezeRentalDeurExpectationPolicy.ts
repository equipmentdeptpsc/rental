import type { DeurShiftWindowDefinition, RentalDeurShiftWindowSnapshot, RentalRecord } from "@/features/rental/types";
import { normalizeRentalDeurExpectationPolicy } from "./normalizeRentalDeurExpectationPolicy";
import { normalizeDeurShiftWindow } from "../shift-window/normalizeDeurShiftWindow";

export function freezeRentalDeurExpectationPolicy(rental: RentalRecord, timestamp: string, liveShiftWindows: DeurShiftWindowDefinition[] = []) {
  if (!Number.isFinite(Date.parse(timestamp))) return { success: false as const, message: "Policy freeze timestamp is invalid." };
  if (!rental.deurExpectationPolicy) {
    if (rental.deurExpectationPolicyRequired) return { success: false as const, message: "Configure a DEUR expectation policy before release." };
    return { success: true as const, rental: structuredClone(rental) };
  }
  const normalized = normalizeRentalDeurExpectationPolicy({ ...rental.deurExpectationPolicy, capturedAt: timestamp });
  if (!normalized.valid) return { success: false as const, message: normalized.message };
  let snapshots: RentalDeurShiftWindowSnapshot[] | undefined;
  if (normalized.value.frequency === "PER_SHIFT") {
    const selected: RentalDeurShiftWindowSnapshot[] = [];
    for (const code of normalized.value.expectedShiftCodes ?? []) {
      const matches = liveShiftWindows.filter((window) => window.code === code);
      if (matches.length !== 1) return { success: false as const, message: `A valid ${code} shift window must be configured before release.` };
      const window = normalizeDeurShiftWindow({ ...matches[0], capturedAt: timestamp });
      if (!window.valid) return { success: false as const, message: window.message };
      selected.push({ ...window.value, capturedAt: new Date(timestamp).toISOString() });
    }
    snapshots = selected;
  }
  return { success: true as const, rental: { ...structuredClone(rental), deurExpectationPolicy: normalized.value, deurExpectationPolicyFrozenAt: new Date(timestamp).toISOString(), ...(snapshots ? { deurShiftWindowSnapshots: structuredClone(snapshots) } : {}) } };
}
