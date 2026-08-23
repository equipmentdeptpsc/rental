import { PersistenceMode, type ApplicationRuntimeConfiguration } from "@/app/composition";

export interface ProjectRuntimeCapability {
  canonicalReads: boolean;
  legacyReads: boolean;
  legacyMutations: boolean;
}

export function getProjectRuntimeCapability(configuration: ApplicationRuntimeConfiguration): ProjectRuntimeCapability {
  const remote = configuration.persistenceMode === PersistenceMode.Remote;
  return { canonicalReads: remote, legacyReads: !remote, legacyMutations: !remote };
}

export const REMOTE_PROJECT_MUTATION_UNAVAILABLE_MESSAGE = "Project changes are unavailable in remote mode until a canonical Project command is certified.";
