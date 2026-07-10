import {
    useMemo,
  } from "react";
  
  import {
    useRentalWorkspaceAggregate,
  } from "..";
  
  import {
    buildBillingSummary,
  } from "./BillingBuilder";
  
  export function useBillingSummary() {
    const aggregate =
      useRentalWorkspaceAggregate();
  
    return useMemo(
      () =>
        buildBillingSummary(
          aggregate
        ),
      [aggregate]
    );
  }