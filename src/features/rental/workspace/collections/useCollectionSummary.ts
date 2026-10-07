import { useMemo } from "react";
import { useRentalWorkspaceAggregate, useRentalWorkspaceBillingStatements, useRentalWorkspaceCollections } from "..";
import { buildCollectionSummary } from "./CollectionBuilder";
import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import { collectionRepository } from "@/features/rental/collections/repository";
import { PersistenceMode, useApplicationDependenciesCompatibility } from "@/app/composition";

export function useCollectionSummary() {
  const aggregate = useRentalWorkspaceAggregate();
  const dependencies = useApplicationDependenciesCompatibility();
  const statements = useRentalWorkspaceBillingStatements();
  const transactions = useRentalWorkspaceCollections();
  return useMemo(
    () => buildCollectionSummary(dependencies.configuration.persistenceMode === PersistenceMode.Remote ? statements : billingStatementRepository.getByRentalId(aggregate.rental.id), dependencies.configuration.persistenceMode === PersistenceMode.Remote ? transactions : collectionRepository.getByRentalId(aggregate.rental.id)),
    [aggregate.rental.id, dependencies.configuration.persistenceMode, statements, transactions],
  );
}
