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
      const summary = buildInvoiceSummary(aggregate);
      const statements = billingStatementRepository.getByRentalId(aggregate.rental.id).filter((statement) => statement.invoiceStatus !== "Cancelled");
      return { ...summary, documents: statements.map((statement) => buildInvoiceDocument(statement, equipment, operators, aggregate.contract?.currency ?? "PHP", statements.length === 1 ? { amountCollected: aggregate.billing.collected, outstandingBalance: aggregate.billing.outstanding } : undefined)) };
    }, [aggregate, equipment, operators, billingStatementRepository]);
  }
