import type {
  BillingPreviewLine,
} from "./types";

import type {
  RentalAggregate,
} from "@/features/rental/aggregate";

import type {
  BillingStatement,
} from "@/features/rental/billingstatement/types";
import type { BillingChargeResult } from "@/features/rental/billing/engine";

export function createBillingStatement(

  aggregate: RentalAggregate,

  from: string,

  to: string,
  lines: BillingPreviewLine[],
  financials?: Pick<BillingChargeResult, "vat" | "withholdingTax" | "grandTotal">,
  identity?: { id: string; statementNo: string },

): BillingStatement {

  const subtotal =
    lines.reduce(

      (sum, line) =>

        sum + line.amount,

      0

    );

  return {

    id: identity?.id ?? crypto.randomUUID(),

    statementNo:
      identity?.statementNo ?? `BS-${Date.now()}`,

    version: 1,

    rentalId:
      aggregate.rental.id,

    customer:
      aggregate.rental.customer,

    project:
      aggregate.project?.projectName ??
      aggregate.rental.project,

    equipmentId:
      aggregate.rental.equipmentId,

    operatorId:
      aggregate.operator?.id ??
      aggregate.rental.operatorId ??
      aggregate.assignment?.operatorId ??
      "",

    billingFrom: from,

    billingTo: to,

    subtotal,
    vat: financials?.vat,
    withholdingTax: financials?.withholdingTax,
    grandTotal: financials?.grandTotal,

    approvalStatus:
      "Draft",

    invoiceStatus:
      "Not Invoiced",

    submittedBy: undefined,

    submittedAt: undefined,

    approvedBy: undefined,

    approvedAt: undefined,

    rejectedBy: undefined,

    rejectedAt: undefined,

    rejectionRemarks: undefined,

    lines: lines.map(

      line => ({

        id:
          (line as BillingPreviewLine & { id?: string }).id ??
          line.deurId,

        deurId:
          line.deurId,

        deurRevisionChainId: line.deurRevisionChainId,

        deurRevisionNumber: line.deurRevisionNumber,

        effectiveDeurId: line.effectiveDeurId,

        correctedFromDeurId: line.correctedFromDeurId,

        workDate:
          line.workDate,

        description:
          line.description,

        costCode:
          line.costCode,

        activityCode: line.activityCode,

        quantity: line.quantity,

        unit: line.unit,

        unitRate: line.unitRate,

        billingMethod: line.billingMethod,

        commercialTermsSource: line.commercialTermsSource,

        commercialCapturedAt: line.commercialCapturedAt,

        hours:
          line.operatingHours,

        hourlyRate:
          line.hourlyRate,

        amount:
          line.amount,

      })

    ),

    createdBy:
      "System",

    createdAt:
      new Date().toISOString(),

  };

}
