import type { RentalEquipmentLine } from "../equipment-line";
import type { RentalDeurExpectationPolicy, RentalRecord } from "../types";
import { normalizeRentalDeurExpectationPolicy } from "../deur/expectation/normalizeRentalDeurExpectationPolicy";

export interface RentalWorkspaceDeurPolicyDisplay {
  policy?: RentalDeurExpectationPolicy;
  staged: boolean;
}

/** Resolves display-only Draft preparation without promoting it to the active Rental policy. */
export function resolveRentalWorkspaceDeurPolicy(
  rental: RentalRecord,
  lines: RentalEquipmentLine[],
): RentalWorkspaceDeurPolicyDisplay {
  if (rental.deurExpectationPolicy) return { policy: rental.deurExpectationPolicy, staged: false };
  if (rental.status !== "Draft" || lines.length === 0) return { staged: false };
  const candidates = lines.map((line) => line.operationalMetadata?.draftPreparation?.deurPolicy);
  if (candidates.some((candidate) => !candidate)) return { staged: false };
  const normalized = candidates.map((candidate) => normalizeRentalDeurExpectationPolicy(candidate));
  if (normalized.some((candidate) => !candidate.valid)) return { staged: false };
  const policies = normalized.map((candidate) => candidate.valid ? candidate.value : undefined);
  const first = policies[0];
  if (!first || policies.some((candidate) => JSON.stringify(candidate) !== JSON.stringify(first))) return { staged: false };
  return { policy: first, staged: true };
}
