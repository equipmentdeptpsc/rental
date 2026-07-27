import { useMemo } from "react";

import { useRentalWorkspaceAggregate } from "..";

import { buildTimeline } from "./TimelineBuilder";
import { developmentCustomerReviewOutbox } from "@/features/rental/customer-review/developmentCustomerReviewOutbox";
import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import { collectionRepository } from "@/features/rental/collections/repository";

export function useTimeline() {
  const aggregate =
    useRentalWorkspaceAggregate();

  return useMemo(
    () => buildTimeline(aggregate, {
      customerReviews: developmentCustomerReviewOutbox.getAll().filter((entry) => aggregate.deurs.some((deur) => deur.id === entry.deurId)),
      billingStatements: billingStatementRepository.getByRentalId(aggregate.rental.id),
      collections: collectionRepository.getByRentalId(aggregate.rental.id),
    }),
    [aggregate]
  );
}
