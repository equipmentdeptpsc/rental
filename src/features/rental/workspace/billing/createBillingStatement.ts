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
  const aggregatedVat = lines.reduce((sum, line) => sum + (line.vat ?? 0), 0);
  const aggregatedWithholding = lines.reduce((sum, line) => sum + (line.withholdingTax ?? 0), 0);
  const aggregatedGrandTotal = lines.reduce((sum, line) => sum + (line.grandTotal ?? line.amount), 0);
  const equipmentAwareLines = lines.filter((line) => line.rentalEquipmentLineId && line.equipmentId);
  const singleEquipmentId = new Set(equipmentAwareLines.map((line) => line.equipmentId)).size === 1
    ? equipmentAwareLines[0]?.equipmentId
    : undefined;
  const singleOperatorId = new Set(equipmentAwareLines.map((line) => line.operatorId).filter(Boolean)).size === 1
    ? equipmentAwareLines[0]?.operatorId
    : undefined;

  return {

    id: identity?.id ?? crypto.randomUUID(),

    statementNo:
      identity?.statementNo ?? `BS-${Date.now()}`,

    version: 1,

    rentalId:
      aggregate.rental.id,
    rentalNumber: aggregate.rental.rentalNumber,
    customerRepresentativeName: aggregate.rental.customerContactSnapshot?.representativeName,
    customerRepresentativeEmail: aggregate.rental.customerContactSnapshot?.representativeEmail,

    customer:
      aggregate.rental.customer,

    project:
      aggregate.project?.projectName ??
      aggregate.rental.project,

    equipmentId: equipmentAwareLines.length ? singleEquipmentId ?? "" : aggregate.rental.equipmentId,

    operatorId:
      singleOperatorId ?? aggregate.operator?.id ??
      aggregate.rental.operatorId ??
      aggregate.assignment?.operatorId ??
      "",

    billingFrom: from,

    billingTo: to,

    subtotal,
    vatApplicable: lines.some(line=>line.vat!==undefined),
    withholdingTaxApplicable: lines.some(line=>line.withholdingTax!==undefined),
    ...(lines.some(line=>line.vat!==undefined)?{vat:financials?.vat??aggregatedVat}:{}),
    ...(lines.some(line=>line.withholdingTax!==undefined)?{withholdingTax:financials?.withholdingTax??aggregatedWithholding}:{}),
    grandTotal: financials?.grandTotal ?? aggregatedGrandTotal,

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
        rentalEquipmentLineId: line.rentalEquipmentLineId,
        equipmentId: line.equipmentId,
        operatorId: line.operatorId,
        shift: line.shift,

        deurRevisionChainId: line.deurRevisionChainId,

        deurRevisionNumber: line.deurRevisionNumber,

        effectiveDeurId: line.effectiveDeurId,

        correctedFromDeurId: line.correctedFromDeurId,
        deurReference: line.deurReference,
        equipmentLabel: line.equipmentLabel,
        operatorLabel: line.operatorLabel,

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
        operatingCharge: line.operatingCharge,
        idleCharge: line.idleCharge,
        mobilizationCharge: line.mobilizationCharge,
        demobilizationCharge: line.demobilizationCharge,
        operatorCharge: line.operatorCharge,
        fuelCharge: line.fuelCharge,
        vat: line.vat,
        withholdingTax: line.withholdingTax,
        grandTotal: line.grandTotal,

      })

    ),

    createdBy:
      "System",

    createdAt:
      new Date().toISOString(),

  };

}
