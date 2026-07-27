import { useMemo } from "react";
import { useRentalWorkspaceAggregate } from "..";
import { buildCollectionSummary } from "./CollectionBuilder";
import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import { collectionRepository } from "@/features/rental/collections/repository";

export function useCollectionSummary() {
  const aggregate = useRentalWorkspaceAggregate();
  return useMemo(
    () => buildCollectionSummary(billingStatementRepository.getByRentalId(aggregate.rental.id), collectionRepository.getByRentalId(aggregate.rental.id)),
    [aggregate],
  );
}
