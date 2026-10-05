import { PersistenceMode, type ApplicationRuntimeConfiguration } from "@/app/composition";

export interface EquipmentRuntimeCapability {
  canonicalReads: boolean;
  legacyReads: boolean;
  legacyMutations: boolean;
  canonicalCreate: boolean;
  canonicalMaintenanceUpdate: boolean;
}

export function getEquipmentRuntimeCapability(configuration: ApplicationRuntimeConfiguration, hasCanonicalCommand = false): EquipmentRuntimeCapability {
  const remote = configuration.persistenceMode === PersistenceMode.Remote;
  return {
    canonicalReads: remote,
    legacyReads: !remote,
    legacyMutations: !remote,
    canonicalCreate: remote && hasCanonicalCommand && (configuration.remoteOperationalWritesEnabled === true || configuration.remoteEquipmentCreateEnabled === true),
    canonicalMaintenanceUpdate: remote && hasCanonicalCommand && (configuration.remoteOperationalWritesEnabled === true || configuration.remoteEquipmentUpdateEnabled === true),
  };
}

export const REMOTE_EQUIPMENT_MUTATION_UNAVAILABLE_MESSAGE = "Equipment changes are currently unavailable.";
