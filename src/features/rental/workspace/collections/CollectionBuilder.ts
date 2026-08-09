import type { BillingStatement } from "@/features/rental/billingstatement/types";
import type { CollectionTransaction } from "@/features/rental/collections/types";
import { reconcileStatementCollections } from "@/features/rental/collections/collectionService";

export function buildCollectionSummary(statements: BillingStatement[], transactions: CollectionTransaction[]) {
  const active = statements.filter((statement) => statement.invoiceStatus !== "Cancelled");
  const totals = active.map((statement) => reconcileStatementCollections(statement, transactions));
  const history = transactions.filter((item) => active.some((statement) => statement.id === item.statementId)).toSorted((a,b)=>b.recordedAt.localeCompare(a.recordedAt));
  return {
    hasStatement: active.length > 0,
    invoiceTotal: totals.reduce((sum,item)=>sum+item.invoiceTotal,0),
    totalCollected: totals.reduce((sum,item)=>sum+item.totalCollected,0),
    outstanding: totals.reduce((sum,item)=>sum+item.outstandingBalance,0),
    collectionCount: history.length,
    latestCollectionDate: history[0]?.paymentDate,
    latestReferenceNo: history[0]?.referenceNumber,
    history,
  };
}
