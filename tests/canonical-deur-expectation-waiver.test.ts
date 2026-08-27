import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {evaluateRentalEquipmentLineDeurCompliance} from "@/features/rental/deur/compliance/evaluateRentalDeurCompliance";
import type {RentalRecord} from "@/features/rental/types";
import type {RentalEquipmentLine} from "@/features/rental/equipment-line";

const migration=readFileSync("supabase/migrations/20260826000700_canonical_deur_expectation_waiver.sql","utf8");
const workspaceHeader=readFileSync("src/features/rental/workspace/components/RentalWorkspaceHeader.tsx","utf8");
const rental:RentalRecord={id:"rental",equipmentId:"equipment",operatorId:"operator",customer:"Customer",project:"Project",rentedBy:"Admin",dateOut:"2026-08-25",statusId:"active",status:"Active",releasedAt:"2026-08-25T01:00:00Z",deurExpectationPolicyRequired:true,deurExpectationPolicyFrozenAt:"2026-08-25T01:00:00Z",deurExpectationPolicy:{frequency:"PER_WORKDAY",effectiveFrom:"2026-08-25",timezone:"Asia/Manila",capturedAt:"2026-08-25T01:00:00Z"}};
const line:RentalEquipmentLine={id:"line",rentalId:"rental",equipmentId:"equipment",assignmentId:"assignment",operatorId:"operator",status:"Active",createdAt:"2026-08-25T01:00:00Z",updatedAt:"2026-08-25T01:00:00Z",deurExpectationSnapshot:{rentalEquipmentLineId:"line",rentalId:"rental",equipmentId:"equipment",assignmentId:"assignment",operatorId:"operator",projectId:"project",policy:rental.deurExpectationPolicy!,shiftWindows:[],workDescription:{name:"Work",requiresRemarks:false},workDateRule:"RENTAL_DATE_OUT",workDate:"2026-08-25",meterRequirement:"none",fuelEvidenceRequired:false,billingMethod:"Per Hour",operationalMetadata:{},sourceFingerprint:"fingerprint",capturedAt:"2026-08-25T01:00:00Z"}};

describe("canonical historical DEUR expectation waiver",()=>{
 it("uses a dedicated immutable disposition and action-specific System Administrator permission",()=>{
  for(const marker of["deur_expectation_dispositions","deur.expectation.waive","role.code='system-administrator'","command_waive_deur_expectation","DEUR_EXPECTATION_WAIVED","begin_operational_command","finish_operational_command"])expect(migration).toContain(marker);
  expect(migration).not.toMatch(/role\.code='operations-manager'.*deur\.expectation\.waive/s);
  expect(migration).toContain("REVOKE ALL ON erp.deur_expectation_dispositions");
 });
 it("validates tenant, historical identity, fingerprint, missing evidence, reason, and exact replay",()=>{
  for(const marker of["erp.current_company_id()","command ? 'companyId'","expectationFingerprint","PER_WORKDAY","work_day>=(timezone(timezone_name,now_at))::date","EXPECTATION_HAS_DEUR","ALREADY_WAIVED","IDEMPOTENCY_MISMATCH","'REPLAYED'"])expect(migration).toContain(marker);
 });
 it("keeps the expectation generated and projects the waiver distinctly",()=>{
  const result=evaluateRentalEquipmentLineDeurCompliance({rental,lines:[line],deurs:[],dispositions:[{id:"waiver",rentalId:"rental",rentalEquipmentLineId:"line",workDate:"2026-08-25",expectationFingerprint:"fingerprint",disposition:"WAIVED",reason:"Audited historical exception",createdAt:"2026-08-27T00:00:00Z",createdBy:"admin"}],evaluationTimestamp:"2026-08-26T12:00:00Z"});
  expect(result[0].result).toMatchObject({status:"COMPLIANT_WITH_WAIVERS",expectedCount:2,compliantCount:0,waivedCount:1,missingCount:0,expectations:[{workDate:"2026-08-25",status:"WAIVED"},{workDate:"2026-08-26",status:"CURRENT"}]});
 });
 it("does not create or mutate DEUR, Rental, policy, event, or billing evidence",()=>{
  for(const forbidden of["INSERT INTO erp.deurs","UPDATE erp.deurs","UPDATE erp.rentals","INSERT INTO erp.deur_events","INSERT INTO erp.billing_statement_lines"])expect(migration).not.toContain(forbidden);
 });
 it("uses an accessible in-page reason form instead of a suppressed browser prompt",()=>{
  expect(workspaceHeader).toContain('aria-label="Historical DEUR expectation waiver"');
  expect(workspaceHeader).toContain("Confirm waiver");
  expect(workspaceHeader).not.toContain("window.prompt");
 });
});
