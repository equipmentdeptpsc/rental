import { describe, expect, it } from "vitest";
import { buildCanonicalProjectCreateCommand } from "../src/features/project/services/buildCanonicalProjectCreateCommand";

const identity={projectId:"project-id",commandId:"command-id",idempotencyKey:"idem-id"};
describe("canonical Project Customer-link command",()=>{
  it("keeps selected Customer identity and explicit location independent",()=>{
    const command=buildCanonicalProjectCreateCommand(identity,{projectCode:" P-1 ",name:" Project ",customerId:" fd753935-f65c-456b-ad54-55265dc3223d ",location:" Manila Yard "});
    expect(command).toMatchObject({projectCode:"P-1",name:"Project",customerId:"fd753935-f65c-456b-ad54-55265dc3223d",location:"Manila Yard"});
    expect(command.location).not.toContain("UAT-CUS-001");
  });
  it("omits both optional values independently when blank",()=>{
    const command=buildCanonicalProjectCreateCommand(identity,{projectCode:"P-2",name:"Project",customerId:"",location:""});
    expect(command).not.toHaveProperty("customerId");
    expect(command).not.toHaveProperty("location");
  });
  it("allows either optional value without coupling them",()=>{
    expect(buildCanonicalProjectCreateCommand(identity,{projectCode:"P",name:"N",customerId:"customer-id",location:""})).toMatchObject({customerId:"customer-id"});
    expect(buildCanonicalProjectCreateCommand(identity,{projectCode:"P",name:"N",customerId:"",location:"Site"})).toMatchObject({location:"Site"});
  });
});
