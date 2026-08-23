import { PersistenceMode, type ApplicationRuntimeConfiguration } from "@/app/composition";

export interface OperatorRuntimeCapability {
  canonicalReads: boolean;
  legacyReads: boolean;
  legacyMutations: boolean;
}

export function getOperatorRuntimeCapability(configuration: ApplicationRuntimeConfiguration): OperatorRuntimeCapability {
  const remote = configuration.persistenceMode === PersistenceMode.Remote;
  return { canonicalReads: remote, legacyReads: !remote, legacyMutations: !remote };
}

export const REMOTE_OPERATOR_MUTATION_UNAVAILABLE_MESSAGE = "Operator changes, linked-user changes, and PIN changes are unavailable in remote mode until canonical commands are certified.";
