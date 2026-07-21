import {
    useMemo,
  } from "react";
  
  import {
    useRentalWorkspaceAggregate,
  } from "..";
  
  import {
    buildInvoiceSummary,
  } from "./InvoiceBuilder";
  import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
  import { useEquipment } from "@/features/equipment/context/EquipmentContext";
  import { useOperator } from "@/features/operators/context/OperatorContext";
  import { buildInvoiceDocument } from "./InvoiceDocumentBuilder";
  
  export function useInvoiceSummary() {
    const aggregate =
      useRentalWorkspaceAggregate();
    const { equipment } = useEquipment();
    const { operators } = useOperator();
  
    return useMemo(() => {
      const summary = buildInvoiceSummary(aggregate);
      const statements = billingStatementRepository.getByRentalId(aggregate.rental.id).filter((statement) => statement.invoiceStatus !== "Cancelled");
      return { ...summary, documents: statements.map((statement) => buildInvoiceDocument(statement, equipment, operators, aggregate.contract?.currency ?? "PHP", statements.length === 1 ? { amountCollected: aggregate.billing.collected, outstandingBalance: aggregate.billing.outstanding } : undefined)) };
    }, [aggregate, equipment, operators]);
  }
