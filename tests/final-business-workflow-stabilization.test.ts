import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import { buildCustomerReviewTimeline } from "@/features/rental/customer-review/buildCustomerReviewSnapshot";
import { createCustomerReviewRequestForSubmittedDeur } from "@/features/rental/customer-review/createCustomerReviewRequestForSubmittedDeur";
import { developmentCustomerReviewOutbox, DEVELOPMENT_CUSTOMER_REVIEW_OUTBOX_KEY } from "@/features/rental/customer-review/developmentCustomerReviewOutbox";
import { rentalRepository } from "@/features/rental/repository";
import { customerRepository } from "@/features/customer/repository";
import { equipmentRepository } from "@/features/equipment/repository";
import { operatorRepository } from "@/features/operators/repository";
import { projectRepository } from "@/features/project/repository";
import { rentalEquipmentLineRepository } from "@/features/rental/equipment-line/repository";
import { buildBillingStatementEmail } from "@/features/rental/billing-email/buildBillingStatementEmail";
import { billingStatementPdfText, generateBillingStatementPdf } from "@/features/rental/billing-email/generateBillingStatementPdf";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { InvoiceDocument } from "@/features/rental/workspace/invoice/InvoiceDocumentBuilder";

const events = [
  { id:"1", activityType:"operation", action:"start", timestamp:"2026-07-27T23:50:00Z", sequence:1, source:"user" },
  { id:"2", activityType:"operation", action:"end", timestamp:"2026-07-28T00:10:00Z", sequence:2, source:"user" },
] as const;

const deur = (revisionNumber=1): DeurRecord => ({
  id:`deur-${revisionNumber}`, deurNumber:"DEUR-000001", rentalId:"rental-1", rentalEquipmentLineId:"line-1",
  equipmentId:"equipment-1", operatorId:"operator-1", projectId:"project-1", workDate:"2026-07-27",
  events:structuredClone(events), logs:[], totals:{shiftMinutes:20,operationMinutes:20,idleMinutes:0,mealBreakMinutes:0,breakdownMinutes:0},
  totalOperatingMinutes:20,totalIdleMinutes:0,totalMaintenanceMinutes:0,totalMealBreakMinutes:0,totalMobilizationMinutes:0,totalDemobilizationMinutes:0,
  status:"Submitted",createdAt:"2026-07-27T23:50:00Z",updatedAt:"2026-07-28T00:10:00Z",
  revision:{chainId:"chain",revisionNumber,originalDeurId:"deur-1",...(revisionNumber>1?{previousRevisionId:"deur-1"}:{})},
});

describe("final business workflow stabilization", () => {
  beforeEach(() => storage.remove(DEVELOPMENT_CUSTOMER_REVIEW_OUTBOX_KEY));

  it("pairs canonical overnight events without reconstructing timestamps from totals", () => {
    expect(buildCustomerReviewTimeline(structuredClone(events))).toEqual([expect.objectContaining({
      activityType:"Operation", start:"2026-07-27T23:50:00Z", end:"2026-07-28T00:10:00Z", durationMinutes:20,
    })]);
  });

  it("creates one immutable request per submitted revision and a new request for R2", () => {
    vi.spyOn(rentalRepository,"getById").mockReturnValue({id:"rental-1",rentalNumber:"R-1",customerId:"customer-1",customer:"Customer",projectId:"project-1",project:"Project",status:"Active",dateOut:"2026-07-27",customerContactSnapshot:{representativeName:"Rep",representativeEmail:"rep@test.dev"}} as never);
    vi.spyOn(customerRepository,"getById").mockReturnValue({id:"customer-1",companyName:"Customer",contactPerson:"Rep",email:"rep@test.dev"} as never);
    vi.spyOn(equipmentRepository,"getById").mockReturnValue({id:"equipment-1",equipmentName:"UAT 1",assetNo:"ME-000001"} as never);
    vi.spyOn(operatorRepository,"getById").mockReturnValue({id:"operator-1",name:"UAT Operator 1"} as never);
    vi.spyOn(projectRepository,"getById").mockReturnValue({id:"project-1",projectName:"Project"} as never);
    vi.spyOn(rentalEquipmentLineRepository,"getById").mockReturnValue({id:"line-1",rentalId:"rental-1",equipmentId:"equipment-1",operatorId:"operator-1"} as never);
    const first=createCustomerReviewRequestForSubmittedDeur(deur());
    const duplicate=createCustomerReviewRequestForSubmittedDeur(deur());
    const correction=createCustomerReviewRequestForSubmittedDeur(deur(2));
    expect(first.success&&first.created).toBe(true);
    expect(duplicate.success&&duplicate.created).toBe(false);
    expect(correction.success&&correction.created).toBe(true);
    expect(developmentCustomerReviewOutbox.getAll()).toHaveLength(2);
    expect((first.success&&first.entry.snapshot.timeline?.[0].durationMinutes)).toBe(20);
  });

  it("uses statement grand total in email and produces a PDF statement snapshot", () => {
    const email=buildBillingStatementEmail({statementNumber:"BS-1",rentalNumber:"R-1",customer:"Customer",representativeName:"Rep",recipient:"rep@test.dev",project:"Project",billingFrom:"2026-07-01",billingTo:"2026-07-31",amountDue:310,currency:"PHP"});
    expect(email.body).toContain("Amount Due: PHP 310.00");
    const document={statementNo:"BS-1",statementDate:"2026-07-27",customer:"Customer",rentalNumber:"R-1",project:"Project",billingFrom:"2026-07-01",billingTo:"2026-07-31",currency:"PHP",subtotal:300,vat:30,withholdingTax:20,grandTotal:310,lines:[{equipmentLabel:"UAT 1 (ME-000001)",operatorLabel:"UAT Operator 1",deurReference:"DEUR-000001 R1",workDate:"2026-07-27",description:"Rental",billingMethod:"Hourly",hourlyRate:100,amount:300,optionalCharges:[]}]} as unknown as InvoiceDocument;
    expect(new TextDecoder().decode(generateBillingStatementPdf(document)).startsWith("%PDF-1.4")).toBe(true);
    expect(billingStatementPdfText(document)).toEqual(expect.arrayContaining(["GRAND TOTAL: PHP 310.00"]));
  });
});
