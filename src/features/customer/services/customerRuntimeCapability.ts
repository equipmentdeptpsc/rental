import { PersistenceMode, type ApplicationRuntimeConfiguration } from "@/app/composition";

export function getCustomerRuntimeCapability(configuration: ApplicationRuntimeConfiguration, repositoryAvailable = false) {
  const remote = configuration.persistenceMode === PersistenceMode.Remote;
  return { canonicalReads: remote, legacyReads: !remote, legacyMutations: !remote, canonicalMutations: remote && repositoryAvailable && (configuration.remoteOperationalWritesEnabled === true || configuration.remoteCustomerCreateEnabled === true) };
}
export const REMOTE_CUSTOMER_MUTATION_UNAVAILABLE_MESSAGE = "Customer changes are currently unavailable.";
