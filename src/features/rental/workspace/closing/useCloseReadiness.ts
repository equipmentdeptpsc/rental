import {
    useMemo,
  } from "react";
  
  import {
    useRentalWorkspaceAggregate,
  } from "..";
  
  import {
    buildCloseReadiness,
  } from "./CloseReadinessBuilder";
  
  export function useCloseReadiness() {
    const aggregate =
      useRentalWorkspaceAggregate();
  
    return useMemo(
      () =>
        buildCloseReadiness(
          aggregate
        ),
      [aggregate]
    );
  }