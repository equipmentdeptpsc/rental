import {
    useMemo,
  } from "react";
  
import {
    useRentalWorkspaceAggregate,
    useRentalWorkspaceBillingStatements,
  } from "..";
  
  import {
    buildInvoiceSummary,
  } from "./InvoiceBuilder";
  import { useEquipment } from "@/features/equipment/context/EquipmentContext";
  import { useOperator } from "@/features/operators/context/OperatorContext";
  import { buildInvoiceDocument } from "./InvoiceDocumentBuilder";
  
  export function useInvoiceSummary() {
    const aggregate =
    useRentalWorkspaceAggregate();
    const statements = useRentalWorkspaceBillingStatements();
    const { equipment } = useEquipment();
    const { operators } = useOperator();
  
    return useMemo(() => {
      const activeStatements = statements.filter((statement) => statement.invoiceStatus !== "Cancelled");
      const summary = buildInvoiceSummary(aggregate, activeStatements);
      return { ...summary, documents: activeStatements.filter((statement) => statement.invoiceStatus !== "Not Invoiced").map((statement) => buildInvoiceDocument(statement, equipment, operators, aggregate.contract?.currency ?? "PHP", activeStatements.length === 1 ? { amountCollected: aggregate.billing.collected, outstandingBalance: aggregate.billing.outstanding } : undefined)) };
    }, [aggregate, equipment, operators, statements]);
  }
