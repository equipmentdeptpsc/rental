import { PersistenceMode, type ApplicationDependencies } from "@/app/composition";

type RentalRuntimeConfiguration = ApplicationDependencies["configuration"];

export const REMOTE_RENTAL_MUTATION_UNAVAILABLE_MESSAGE =
  "Rental creation and changes are not enabled in this UAT environment.";

export function canUseLegacyRentalMutations(configuration: RentalRuntimeConfiguration): boolean {
  return configuration.persistenceMode === PersistenceMode.Local;
}
