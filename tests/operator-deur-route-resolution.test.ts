import { describe, expect, it } from "vitest";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { RentalRecord } from "@/features/rental/types";
import { resolveActiveOperatorDeur } from "@/features/rental/deur/operator/resolveActiveOperatorDeur";
import {
  buildOperatorDeurLineUrl,
  resolveOperatorDeurRouteLine,
  resolveOperatorDeurSelectedLineId,
} from "@/features/rental/deur/operator/resolveOperatorDeurRouteLine";

const rental = (id = "rental-a"): RentalRecord => ({ id, rentalNumber: id, equipmentId: "", customerId: "customer", projectId: "project", customer: "Customer", project: "Project", rentedBy: "Admin", dateOut: "2026-08-02", statusId: "active", status: "Active" });
const operator = (id: string): Operator => ({ id, name: id, email: `${id}@example.test`, licenseNumber: id, certificationType: "Heavy Machinery", status: "Active", joinedDate: "2026-01-01" });
const equipment = (id: string, assetNo = "DUPLICATE-LABEL"): EquipmentRecord => ({ id, prefixId: "EQ", assetNo, equipmentName: "Excavator", category: "Moving Equipment", status: "Assigned", maintenanceType: "Engine Hours", currentReading: 0, projectId: "project", operatorId: `operator-${id.at(-1)}`, active: true });
const assignment = (id: string, equipmentId: string, operatorId: string): AssignmentRecord => ({ id, equipmentId, operatorId, projectId: "project", assignedDate: "2026-08-02", expectedReturn: "2026-08-03", remarks: "", status: "Active" });
const project: ProjectRecord = { id: "project", projectCode: "P", projectName: "Project", location: "Site", projectManager: "Manager", status: "Active" };
const line = (id: string, equipmentId: string, assignmentId: string, operatorId: string, rentalId = "rental-a"): RentalEquipmentLine => ({ id, rentalId, equipmentId, assignmentId, operatorId, status: "Active", createdAt: "2026-08-02T00:00:00Z", updatedAt: "2026-08-02T00:00:00Z", deurExpectationSnapshot: { rentalEquipmentLineId:id,rentalId,equipmentId,assignmentId,operatorId,projectId:"project",customerId:"customer",policy:{frequency:"ON_DEMAND",effectiveFrom:"2026-08-02",capturedAt:"2026-08-02T00:00:00Z"},shiftWindows:[],workDescription:{name:"Work",requiresRemarks:false},workDateRule:"RENTAL_DATE_OUT",workDate:"2026-08-02",meterRequirement:"none",fuelEvidenceRequired:false,billingMethod:"Per Hour",operationalMetadata:{},sourceFingerprint:id,capturedAt:"2026-08-02T00:00:00Z" } });

const lines = [line("line-a", "equipment-a", "assignment-a", "operator-a"), line("line-b", "equipment-b", "assignment-b", "operator-b")];
const assignments = [assignment("assignment-a", "equipment-a", "operator-a"), assignment("assignment-b", "equipment-b", "operator-b")];
const operators = [operator("operator-a"), operator("operator-b")];
const machines = [equipment("equipment-a"), equipment("equipment-b")];
const input = { rental: rental(), rentalId:"rental-a", lines, assignments, operators, equipment:machines, projects:[project] };

describe("Operator DEUR route line resolution",()=>{
  it("builds Continue Line URLs from the rental-line identity",()=>{
    expect(buildOperatorDeurLineUrl("rental/a","line A")).toBe("/rentals/rental%2Fa/operator-deur?lineId=line%20A");
  });
  it.each([["line-a","assignment-a","operator-a","equipment-a"],["line-b","assignment-b","operator-b","equipment-b"]])("resolves %s by exact line ID",(lineId,assignmentId,operatorId,equipmentId)=>{
    expect(resolveOperatorDeurRouteLine({...input,lineId})).toMatchObject({status:"RESOLVED",line:{id:lineId},assignment:{id:assignmentId},operator:{id:operatorId},equipment:{id:equipmentId},project:{id:"project"}});
  });
  it("reapplies the URL identity after asynchronous hydration and direct refresh",()=>{
    expect(resolveOperatorDeurSelectedLineId("line-b","",[])).toBe("line-b");
    expect(resolveOperatorDeurSelectedLineId("line-b","",lines)).toBe("line-b");
    expect(resolveOperatorDeurRouteLine({...input,lineId:resolveOperatorDeurSelectedLineId("line-b","",lines)})).toMatchObject({status:"RESOLVED",line:{id:"line-b"}});
  });
  it("does not fall back for an invalid or cross-rental line ID",()=>{
    expect(resolveOperatorDeurRouteLine({...input,lineId:"missing"})).toEqual({status:"LINE_NOT_FOUND",message:"Rental equipment line not found."});
    expect(resolveOperatorDeurRouteLine({...input,lineId:"line-other",lines:[...lines,line("line-other","equipment-a","assignment-a","operator-a","rental-b")]})).toEqual({status:"LINE_NOT_FOUND",message:"Rental equipment line not found."});
  });
  it("keeps lines with identical visible equipment labels distinct",()=>{
    const a=resolveOperatorDeurRouteLine({...input,lineId:"line-a"}),b=resolveOperatorDeurRouteLine({...input,lineId:"line-b"});
    expect(machines[0]).toMatchObject({equipmentName:machines[1].equipmentName,assetNo:machines[1].assetNo});expect(a).toMatchObject({status:"RESOLVED",line:{id:"line-a",equipmentId:"equipment-a"}});expect(b).toMatchObject({status:"RESOLVED",line:{id:"line-b",equipmentId:"equipment-b"}});
  });
  it("returns an actionable missing-operator error and rejects relationship or snapshot mismatches",()=>{
    expect(resolveOperatorDeurRouteLine({...input,lineId:"line-a",operators:[operators[1]]})).toEqual({status:"OPERATOR_NOT_FOUND",message:"The assigned operator record is missing. Return to the rental workspace and correct the assignment."});
    expect(resolveOperatorDeurRouteLine({...input,lineId:"line-a",assignments:[{...assignments[0],operatorId:"operator-b"},assignments[1]]})).toMatchObject({status:"IDENTITY_MISMATCH"});
    expect(resolveOperatorDeurRouteLine({...input,lineId:"line-a",lines:[{...lines[0],deurExpectationSnapshot:{...lines[0].deurExpectationSnapshot!,operatorId:"operator-b"}},lines[1]]})).toMatchObject({status:"IDENTITY_MISMATCH",message:expect.stringContaining("frozen DEUR expectation snapshot")});
  });
  it("resolves active DEURs by line without cross-line fallback or duplication",()=>{
    const base={rentalId:"rental-a",equipmentId:"equipment-a",operatorId:"operator-a",creationSource:"OPERATOR_DIGITAL" as const,workDate:"2026-08-02",events:[],logs:[],totalOperatingMinutes:0,totalIdleMinutes:0,totalMaintenanceMinutes:0,totalMealBreakMinutes:0,totalMobilizationMinutes:0,totalDemobilizationMinutes:0,status:"Draft" as const,legacy:false,commercialSnapshotRequired:false,createdAt:"2026-08-02",updatedAt:"2026-08-02"};
    const deurs=[{...base,id:"deur-a",rentalEquipmentLineId:"line-a"},{...base,id:"deur-b",rentalEquipmentLineId:"line-b",equipmentId:"equipment-b",operatorId:"operator-b"}];
    expect(resolveActiveOperatorDeur({rentalId:"rental-a",rentalEquipmentLineId:"line-a",equipmentId:"equipment-a",operatorId:"operator-a",deurs})).toMatchObject({status:"RESOLVED",record:{id:"deur-a"}});
    expect(resolveActiveOperatorDeur({rentalId:"rental-a",rentalEquipmentLineId:"line-b",equipmentId:"equipment-b",operatorId:"operator-b",deurs})).toMatchObject({status:"RESOLVED",record:{id:"deur-b"}});
  });
});
