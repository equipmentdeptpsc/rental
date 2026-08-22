import { PersistenceMode, type ApplicationDependencies } from "@/app/composition";
import type { AssignmentRecord } from "@/features/assignment/types";

type Configuration = ApplicationDependencies["configuration"];

export interface AssignmentRuntimeCapability {
  canonicalReads: boolean;
  legacyReads: boolean;
  legacyMutations: boolean;
  canonicalMutations: false;
}

export function getAssignmentRuntimeCapability(configuration: Configuration): AssignmentRuntimeCapability {
  const local = configuration.persistenceMode === PersistenceMode.Local;
  return { canonicalReads: !local, legacyReads: local, legacyMutations: local, canonicalMutations: false };
}

export function canStartRentalFromCanonicalAssignment(input: {
  assignment?: AssignmentRecord;
  rentalCreationAvailable: boolean;
  hasRentalManagePermission: boolean;
}) {
  return Boolean(input.assignment && input.assignment.status === "Active" && input.rentalCreationAvailable && input.hasRentalManagePermission);
}

export const REMOTE_ASSIGNMENT_MUTATION_UNAVAILABLE_MESSAGE = "Assignment changes are unavailable in remote mode until the canonical command boundary is certified.";
