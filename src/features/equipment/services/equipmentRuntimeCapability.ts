import { PersistenceMode, type ApplicationRuntimeConfiguration } from "@/app/composition";

export interface EquipmentRuntimeCapability {
  canonicalReads: boolean;
  legacyReads: boolean;
  legacyMutations: boolean;
}

export function getEquipmentRuntimeCapability(configuration: ApplicationRuntimeConfiguration): EquipmentRuntimeCapability {
  const remote = configuration.persistenceMode === PersistenceMode.Remote;
  return { canonicalReads: remote, legacyReads: !remote, legacyMutations: !remote };
}

export const REMOTE_EQUIPMENT_MUTATION_UNAVAILABLE_MESSAGE = "Equipment changes are unavailable in remote mode until a canonical Equipment command is certified.";
