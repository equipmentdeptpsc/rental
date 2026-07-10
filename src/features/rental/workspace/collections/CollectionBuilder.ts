import type {
    RentalAggregate,
  } from "@/features/rental/aggregate";
  
  import type {
    CollectionSummary,
  } from "./types";
  
  export function buildCollectionSummary(
    aggregate: RentalAggregate
  ): CollectionSummary {
    return {
      totalCollected:
        aggregate.billing.collected,
  
      outstanding:
        aggregate.billing.outstanding,
  
      collectionCount:
        aggregate.billing.collected > 0
          ? 1
          : 0,
  
      latestCollectionDate:
        undefined,
  
      latestReferenceNo:
        undefined,
    };
  }