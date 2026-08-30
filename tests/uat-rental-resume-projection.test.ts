import {describe,expect,it} from "vitest";
import {projectUatRentalResume} from "../worker/uatRentalResumeProjection";

const expected={rentalId:"r-a",rentalNumber:"A",lineIds:["l1"],equipmentIds:["e1"],assignmentIds:["a1"],operatorIds:["o1"],companyId:"c",customerId:"u",projectId:"p",workDate:"2026-08-29"};
const rental={id:"r-a",rental_number:"A",status:"Active",company_id:"c",customer_id:"u",project_id:"p",date_out:"2026-08-29",expected_return:"2026-08-29",row_version:2};

describe("UAT rental resume projection",()=>{
 it("returns exact reuse and no remaining commands for Active",()=>{
  const result=projectUatRentalResume({status:"SUCCESS",rental,lines:[{id:"l1",status:"Active",company_id:"c",equipment_id:"e1",assignment_id:"a1",operator_id:"o1"}]},expected);
  expect(result.lineageClassification).toBe("EXACT_MATCH"); expect(result.reuseDecision).toBe("REUSE"); expect(result.createReservedRentalRequired).toBe(false); expect(result.nextLifecycleCommand).toBe("NONE"); expect(result.remainingLifecycleCommands).toEqual([]); expect(result.preparationState).toBe("NOT_APPLICABLE");
 });
 it("fails closed when persisted lineage is not exact",()=>{
  const result=projectUatRentalResume({status:"SUCCESS",rental:{...rental,customer_id:"other"},lines:[]},expected);
  expect(result.reuseDecision).toBe("BLOCKED"); expect(result.createReservedRentalRequired).toBe(true); expect(result.lineageClassification).toBe("BLOCKED"); expect(result.blockers).toContain("customer");
 });
 it("does not claim preparation evidence for Reserved state",()=>{
  const result=projectUatRentalResume({status:"SUCCESS",rental:{...rental,status:"Reserved"},lines:[{id:"l1",status:"Reserved",company_id:"c",equipment_id:"e1",assignment_id:"a1",operator_id:"o1"}]},expected);
  expect(result.preparationState).toBe("UNKNOWN"); expect(result.nextLifecycleCommand).toBe("UNKNOWN"); expect(result.remainingLifecycleCommands).toEqual([]); expect(result.blockers).toContain("preparationState");
 });
});
