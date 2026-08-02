import { describe, expect, it } from "vitest";
import { validateRentalLineIdentityIntegrity } from "@/features/rental/services/validateRentalLineIdentityIntegrity";
import { mergeOperatorDeurVersions } from "@/pages/OperatorDeur";
import { deriveRentalQuickActions } from "@/features/rental/quick-actions/rentalQuickActions";
import { canEditRentalCommercialTerms } from "@/features/rental/services/configureRentalCommercialTerms";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { DeurRecord } from "@/features/rental/deur/types";

const rental: RentalRecord = { id:"rental",rentalNumber:"R-C8",equipmentId:"",customerId:"customer",projectId:"project",customer:"Customer",project:"Project",rentedBy:"",dateOut:"2026-08-02",statusId:"",status:"Draft",commercialSnapshotRequired:true,deurExpectationPolicyRequired:true,deurExpectationPolicy:{frequency:"ON_DEMAND",effectiveFrom:"2026-08-02",capturedAt:"2026-08-02T00:00:00Z"} };
const line=(suffix:string):RentalEquipmentLine=>({id:`line-${suffix}`,rentalId:rental.id,equipmentId:`equipment-${suffix}`,assignmentId:`assignment-${suffix}`,operatorId:`operator-${suffix}`,status:"Draft",operationalMetadata:{costCode:{code:"C",name:"Cost"},activityCode:{code:"A",name:"Activity"}},commercialSnapshotRequired:true,createdAt:"2026-08-02T00:00:00Z",updatedAt:"2026-08-02T00:00:00Z"});
const lines=[line("a"),line("b")];
const assignments=lines.map((item)=>({id:item.assignmentId!,equipmentId:item.equipmentId,operatorId:item.operatorId,projectId:"project",assignedDate:"2026-08-02",expectedReturn:"2026-08-03",remarks:"",status:"Active" as const}));
const operators=lines.map((item)=>({id:item.operatorId,name:item.operatorId,email:"operator@example.test",licenseNumber:"L",certificationType:"Heavy Machinery" as const,status:"Active" as const,joinedDate:"2026-01-01"}));
const equipment=lines.map((item)=>({id:item.equipmentId,prefixId:"EQ",assetNo:"SAME-LABEL",equipmentName:"Excavator",category:"Moving Equipment" as const,status:"Assigned" as const,maintenanceType:"Engine Hours" as const,currentReading:0,projectId:"project",operatorId:item.operatorId,active:true}));
const projects=[{id:"project",projectCode:"P",projectName:"Project",location:"Site",projectManager:"Manager",status:"Active" as const,customerId:"customer"}];

describe("Phase C8 assignment-to-rental integrity",()=>{
  it("preserves two distinct assignment, equipment, operator, and line identities",()=>{
    expect(validateRentalLineIdentityIntegrity({rental,lines,assignments,operators,equipment,projects})).toEqual([]);
    expect(new Set(lines.map((item)=>item.id)).size).toBe(2);
    expect(new Set(lines.map((item)=>item.equipmentId)).size).toBe(2);
    expect(new Set(lines.map((item)=>item.assignmentId)).size).toBe(2);
    expect(new Set(lines.map((item)=>item.operatorId)).size).toBe(2);
  });

  it("blocks a missing canonical operator and assignment identity mismatches",()=>{
    expect(validateRentalLineIdentityIntegrity({rental,lines,assignments,operators:operators.slice(1),equipment,projects})).toContainEqual(expect.objectContaining({rentalEquipmentLineId:"line-a",code:"OPERATOR_MISSING",message:"The assigned operator record is missing. Return to the rental workspace and correct the assignment before continuing."}));
    expect(validateRentalLineIdentityIntegrity({rental,lines,assignments:[{...assignments[0],operatorId:"operator-b"},assignments[1]],operators,equipment,projects})).toContainEqual(expect.objectContaining({rentalEquipmentLineId:"line-a",code:"ASSIGNMENT_MISMATCH"}));
  });

  it("rejects duplicate equipment identity even when line IDs differ",()=>{
    expect(validateRentalLineIdentityIntegrity({rental,lines:[lines[0],{...lines[1],equipmentId:lines[0].equipmentId}],assignments,operators,equipment,projects})).toContainEqual(expect.objectContaining({code:"DUPLICATE_EQUIPMENT"}));
  });

  it("keeps derived DEUR version state referentially stable so navigation is not trapped in a render loop",()=>{
    const deur={id:"deur-a",rowVersion:3} as DeurRecord & {rowVersion:number};
    const first=mergeOperatorDeurVersions({},[deur]);
    expect(first).toEqual({"deur-a":3});
    expect(mergeOperatorDeurVersions(first,[{...deur}])).toBe(first);
    expect(mergeOperatorDeurVersions(first,[])).toEqual({});
  });

  it("keeps preparation actions available after a failed Draft-to-Assigned reservation attempt",()=>{
    const assigned={...rental,status:"Assigned" as const};
    expect(deriveRentalQuickActions(assigned,"Admin").actions).toEqual([{id:"reserve",label:"Reserve Rental"}]);
    expect(canEditRentalCommercialTerms(assigned)).toBe(true);
  });
});
