import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import Select, { rankSelectOptions } from "@/components/ui/Select";
import { getProjectCustomerOptions } from "@/features/project/services/projectCustomerService";
import { getActiveCostCodeOptions } from "@/features/equipment/utils/equipmentCostCode";

const options=[{value:"1",label:"Alpha"},{value:"2",label:"Alphabet"},{value:"3",label:"North Alpha Yard"},{value:"4",label:"Beta"}];
describe("Milestone 7 canonical searchable select",()=>{
  it("normalizes case and whitespace and ranks exact, prefix, then substring matches",()=>{
    expect(rankSelectOptions(options,"  ALPHA ").map(item=>item.value)).toEqual(["1","2","3"]);
    expect(rankSelectOptions(options,"pha").map(item=>item.value)).toEqual(["1","2","3"]);
  });
  it("supports keyboard selection and the no-match state",async()=>{
    const changed=vi.fn(),container=document.createElement("div"),root=createRoot(container);
    await act(async()=>root.render(createElement(Select,{label:"Master",searchable:true,value:"",options:[{value:"",label:"Select"},...options],onChange:changed})));
    const input=container.querySelector('[role="combobox"]') as HTMLInputElement;
    await act(async()=>input.dispatchEvent(new FocusEvent("focus",{bubbles:true})));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"zzz");await act(async()=>input.dispatchEvent(new Event("input",{bubbles:true})));
    expect(container.textContent).toContain("No matching options");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"alp");await act(async()=>input.dispatchEvent(new Event("input",{bubbles:true})));
    await act(async()=>input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
    expect(changed.mock.calls[0][0].target.value).toBe("1");await act(async()=>root.unmount());
  });
  it("uses business labels that are searchable by customer and cost code or name",()=>{
    const customers=getProjectCustomerOptions([{id:"c",customerCode:"CUS-001",companyName:"Acme Builders",contactPerson:"",contactNumber:"",email:"",address:"",active:true}]);
    expect(rankSelectOptions(customers,"acme")[0].label).toBe("CUS-001 — Acme Builders");expect(rankSelectOptions(customers,"cus-001")).toHaveLength(1);
    const costs=getActiveCostCodeOptions([{id:"cc",code:"OPS-01",description:"Operations",active:true,deleted:false,sortOrder:1,defaultRate:0,unit:"Hour"}]);
    expect(rankSelectOptions(costs,"operations")[0].label).toBe("OPS-01 — Operations");expect(rankSelectOptions(costs,"ops-01")).toHaveLength(1);
  });
});
