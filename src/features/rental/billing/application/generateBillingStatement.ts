import type {
    BillingLine,
    BillingStatement,
  } from "../types";
  
  export interface GenerateBillingStatementRequest {
    rentalId: string;
  
    equipmentId: string;
  
    customerId: string;

projectId: string;
  
    billingPeriodFrom: string;
  
    billingPeriodTo: string;
  
    lines: BillingLine[];
  }
  
  export function generateBillingStatement(
    request: GenerateBillingStatementRequest
  ): BillingStatement {
    const totalOperatingHours =
      request.lines.reduce(
        (sum, line) =>
          sum + line.operatingHours,
        0
      );
  
    const totalActualHours =
      request.lines.reduce(
        (sum, line) =>
          sum + line.actualHours,
        0
      );
  
    const subtotal =
      request.lines.reduce(
        (sum, line) =>
          sum + line.amount,
        0
      );
  
    const vat =
      subtotal * 0.12;
  
    const grandTotal =
      subtotal + vat;
  
    return {
      id: crypto.randomUUID(),
  
      billingNo:
        "",
  
      rentalId:
        request.rentalId,
  
      equipmentId:
        request.equipmentId,
  
        customerId:
        request.customerId,
      
      projectId:
        request.projectId,
  
      billingPeriodFrom:
        request.billingPeriodFrom,
  
      billingPeriodTo:
        request.billingPeriodTo,
  
      generatedDate:
        new Date()
          .toISOString()
          .split("T")[0],
  
      lines:
        request.lines,
  
      totalOperatingHours,
  
      totalActualHours,
  
      subtotal,
  
      vat,
  
      grandTotal,

locked: false,

status:
  "Draft",
    };
  }