import type { BillingStatement } from "@/features/rental/billingstatement/types";
import type { CollectionTransaction } from "@/features/rental/collections/types";
import { reconcileStatementCollections } from "@/features/rental/collections/collectionService";
import type { RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "@/features/rental/deur/types";

export function calculateBusinessDashboardSummary(input:{statements:BillingStatement[];collections:CollectionTransaction[];rentals:RentalRecord[];deurs:DeurRecord[]}){
 const statements=input.statements.filter(item=>item.invoiceStatus!=="Cancelled"&&item.invoiceStatus!=="Not Invoiced");
 const totals=statements.map(statement=>reconcileStatementCollections(statement,input.collections));
 const totalInvoiced=totals.reduce((sum,item)=>sum+item.invoiceTotal,0),totalCollected=totals.reduce((sum,item)=>sum+item.totalCollected,0),outstanding=totals.reduce((sum,item)=>sum+item.outstandingBalance,0);
 return{
  revenue:{billed:totalInvoiced,collected:totalCollected,outstanding},
  collectionPerformance:{totalInvoiced,totalCollected,outstanding,collectionRate:totalInvoiced>0?Math.round(totalCollected/totalInvoiced*10000)/100:0},
  upcoming:{
   scheduledRelease:input.rentals.filter(item=>item.status==="Reserved"&&item.approvalStatus==="Approved").length,
   expectedReturns:input.rentals.filter(item=>["Released","Active"].includes(item.status)&&Boolean(item.expectedReturn)).length,
   pendingManagerApprovals:input.rentals.filter(item=>item.approvalStatus==="Pending").length,
   pendingCustomerAcknowledgements:input.deurs.filter(item=>item.status==="Submitted"&&!item.revision?.supersededByRevisionId).length,
  },
 };
}
