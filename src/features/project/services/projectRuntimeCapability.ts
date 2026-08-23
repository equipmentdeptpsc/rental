import { PersistenceMode, type ApplicationRuntimeConfiguration } from "@/app/composition";

export interface ProjectRuntimeCapability {
  canonicalReads: boolean;
  legacyReads: boolean;
  legacyMutations: boolean;
  canonicalMutations: boolean;
}

export function getProjectRuntimeCapability(configuration: ApplicationRuntimeConfiguration, canonicalRepositoryAvailable = false): ProjectRuntimeCapability {
  const remote = configuration.persistenceMode === PersistenceMode.Remote;
  return { canonicalReads: remote, legacyReads: !remote, legacyMutations: !remote, canonicalMutations: remote && configuration.remoteOperationalWritesEnabled === true && canonicalRepositoryAvailable };
}

export const REMOTE_PROJECT_MUTATION_UNAVAILABLE_MESSAGE = "Project changes are unavailable in remote mode until a canonical Project command is certified.";
