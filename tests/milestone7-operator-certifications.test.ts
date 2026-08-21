import { describe,expect,it } from "vitest";
import { addOperatorCertification,normalizeOperatorCertifications,removeOperatorCertification } from "@/features/operators/services/operatorCertifications";
describe("Milestone 7 Operator certifications",()=>{
 it("preserves legacy edit values and supports multiple structured certifications",()=>{const existing=normalizeOperatorCertifications({certificationType:"Forklift"});expect(existing).toEqual(["Forklift"]);expect(addOperatorCertification(existing,"Heavy Machinery")).toEqual(["Forklift","Heavy Machinery"])});
 it("prevents duplicates and supports removal before save",()=>{expect(addOperatorCertification(["Forklift"],"Forklift")).toEqual(["Forklift"]);expect(removeOperatorCertification(["Forklift","Crane Logistics"],"Forklift")).toEqual(["Crane Logistics"])});
});
