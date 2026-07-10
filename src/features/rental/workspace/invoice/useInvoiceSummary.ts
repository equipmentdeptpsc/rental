import {
    useMemo,
  } from "react";
  
  import {
    useRentalWorkspaceAggregate,
  } from "..";
  
  import {
    buildInvoiceSummary,
  } from "./InvoiceBuilder";
  
  export function useInvoiceSummary() {
    const aggregate =
      useRentalWorkspaceAggregate();
  
    return useMemo(
      () =>
        buildInvoiceSummary(
          aggregate
        ),
      [aggregate]
    );
  }