import { describe, expect, it } from "vitest";
import { resolveAssignmentRentalOrigin } from "../src/features/rental/services/resolveAssignmentRentalOrigin";
import { mapProject } from "../src/integrations/supabase/readRepositories";

const assignment={id:"assignment-3",equipmentId:"equipment-3",operatorId:"operator-3",projectId:"project-3",assignedDate:"2026-08-24",remarks:"",status:"Active" as const};
const project={id:"project-3",projectCode:"UAT-PROJ-003",projectName:"UAT Customer Linked Project",customerId:"customer-1",location:"",projectManager:"",status:"Active" as const};
const customer={id:"customer-1",customerCode:"UAT-CUS-001",companyName:"UAT Equipment Rental Customer",active:true};

describe("Assignment-origin canonical Rental resolution",()=>{
  it("resolves Assignment to canonical Project and Customer IDs",()=>{
    expect(resolveAssignmentRentalOrigin(assignment,[project],[customer])).toEqual({success:true,assignment,project,customer});
  });
  it("never treats Project location as Customer identity",()=>{
    const result=resolveAssignmentRentalOrigin(assignment,[{...project,location:"UAT-CUS-001 — label"}],[customer]);
    expect(result.success&&result.customer.id).toBe("customer-1");
  });
  it.each([
    ["missing project",{...assignment,projectId:"missing"},[project],[customer]],
    ["inactive assignment",{...assignment,status:"Completed" as const},[project],[customer]],
    ["inactive project",assignment,[{...project,status:"Completed" as const}],[customer]],
    ["deleted project",assignment,[{...project,deleted:true}],[customer]],
    ["missing customer link",assignment,[{...project,customerId:undefined}],[customer]],
    ["foreign or missing customer",assignment,[project],[]],
    ["inactive customer",assignment,[project],[{...customer,active:false}]],
  ])("fails safely for %s",(_label,a,p,c)=>expect(resolveAssignmentRentalOrigin(a,p,c).success).toBe(false));
  it("maps canonical Project identity, Customer link, and location independently",()=>{
    const result=mapProject({id:"project-3",project_code:"UAT-PROJ-003",name:"Project",customer_id:"customer-1",location:"Manila",active:true,deleted_at:null});
    expect(result.success&&result.value).toMatchObject({id:"project-3",projectCode:"UAT-PROJ-003",projectName:"Project",customerId:"customer-1",location:"Manila",status:"Active",deleted:false});
  });
});
