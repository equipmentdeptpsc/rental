import {
    useMemo,
  } from "react";
  
  import {
    useRentalWorkspaceAggregate,
  } from "..";
  
  import {
    buildInvoiceSummary,
  } from "./InvoiceBuilder";
  import { useEquipment } from "@/features/equipment/context/EquipmentContext";
  import { useOperator } from "@/features/operators/context/OperatorContext";
  import { buildInvoiceDocument } from "./InvoiceDocumentBuilder";
  import { useApplicationDependenciesCompatibility } from "@/app/composition";
  
  export function useInvoiceSummary() {
    const aggregate =
      useRentalWorkspaceAggregate();
    const { equipment } = useEquipment();
    const { operators } = useOperator();
    const { billingStatement: billingStatementRepository } = useApplicationDependenciesCompatibility().repositories;
  
    return useMemo(() => {
      const activeStatements = billingStatementRepository.getByRentalId(aggregate.rental.id).filter((statement) => statement.invoiceStatus !== "Cancelled");
      const summary = buildInvoiceSummary(aggregate, activeStatements);
      return { ...summary, documents: activeStatements.filter((statement) => statement.invoiceStatus !== "Not Invoiced").map((statement) => buildInvoiceDocument(statement, equipment, operators, aggregate.contract?.currency ?? "PHP", activeStatements.length === 1 ? { amountCollected: aggregate.billing.collected, outstandingBalance: aggregate.billing.outstanding } : undefined, aggregate.deurs)) };
    }, [aggregate, equipment, operators, billingStatementRepository]);
  }
