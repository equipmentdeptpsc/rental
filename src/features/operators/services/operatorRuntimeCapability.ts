import { PersistenceMode, type ApplicationRuntimeConfiguration } from "@/app/composition";

export interface OperatorRuntimeCapability {
  canonicalReads: boolean;
  legacyReads: boolean;
  legacyMutations: boolean;
  canonicalMutations: boolean;
}

export function getOperatorRuntimeCapability(configuration: ApplicationRuntimeConfiguration, canonicalRepositoryAvailable = false): OperatorRuntimeCapability {
  const remote = configuration.persistenceMode === PersistenceMode.Remote;
  return { canonicalReads: remote, legacyReads: !remote, legacyMutations: !remote, canonicalMutations: remote && configuration.remoteOperationalWritesEnabled === true && canonicalRepositoryAvailable };
}

export const REMOTE_OPERATOR_MUTATION_UNAVAILABLE_MESSAGE = "Operator changes, linked-user changes, and PIN changes are unavailable in remote mode until canonical commands are certified.";
