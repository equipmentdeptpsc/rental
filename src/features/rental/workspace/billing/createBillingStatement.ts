import type {
  BillingPreviewLine,
} from "./types";

import type {
  RentalAggregate,
} from "@/features/rental/aggregate";

import type {
  BillingStatement,
} from "@/features/rental/billingstatement/types";

export function createBillingStatement(

  aggregate: RentalAggregate,

  from: string,

  to: string,

  lines: BillingPreviewLine[]

): BillingStatement {

  const subtotal =
    lines.reduce(

      (sum, line) =>

        sum + line.amount,

      0

    );

  return {

    id: crypto.randomUUID(),

    statementNo:
      `BS-${Date.now()}`,

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

        deurId:
          line.deurId,

        workDate:
          line.workDate,

        description:
          line.description,

        costCode:
          line.costCode,

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
