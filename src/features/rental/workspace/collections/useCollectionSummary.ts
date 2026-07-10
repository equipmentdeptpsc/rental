import {
    useMemo,
  } from "react";
  
  import {
    useRentalWorkspaceAggregate,
  } from "..";
  
  import {
    buildCollectionSummary,
  } from "./CollectionBuilder";
  
  export function useCollectionSummary() {
    const aggregate =
      useRentalWorkspaceAggregate();
  
    return useMemo(
      () =>
        buildCollectionSummary(
          aggregate
        ),
      [aggregate]
    );
  }