import { describe,expect,it,vi } from "vitest";
import type { ApplicationReadRepositories } from "@/app/composition/ApplicationDependencies";
import { buildGlobalSearchRecords,createLatestSearchGuard,loadRemoteGlobalSearchData,searchGlobalRecords,type GlobalSearchData } from "@/components/search/globalSearchService";

const data:GlobalSearchData={
 equipment:[{id:"e1",prefixId:"ME",assetNo:"EQP-000023",equipmentName:"CAT  320",category:"Moving Equipment",status:"Available",maintenanceType:"Engine Hours",currentReading:0,projectId:"p1",operatorId:"o1"}],
 operators:[{id:"o1",name:"Maria Santos",email:"maria@example.com",licenseNumber:"OP-007",certificationType:"Heavy Machinery",status:"Active",joinedDate:"2026-01-01"}],
 customers:[{id:"c1",customerCode:"CUS-01",companyName:"Acme Builders",contactPerson:"Ana",contactNumber:"1",email:"a@acme.test",address:"Manila",active:true}],
 projects:[{id:"p1",projectCode:"PRJ-01",projectName:"Harbor Works",location:"Manila",projectManager:"Ben",status:"Active",customerId:"c1"}],
 assignments:[{id:"a1",equipmentId:"e1",operatorId:"o1",projectId:"p1",assignedDate:"2026-08-01",expectedReturn:"2026-08-31",remarks:"Night works",status:"Active"}],
 rentals:[{id:"r1",rentalNumber:"RNT-2026-0041",equipmentId:"e1",customerId:"c1",projectId:"p1",operatorId:"o1",assignmentId:"a1",customer:"Acme Builders",project:"Harbor Works",rentedBy:"Admin",dateOut:"2026-08-01",statusId:"active",status:"Active",rentalType:"Operated Rental",billingMethod:"Per Day"}],
 deurs:[{id:"d1",deurNumber:"DEUR-009",rentalId:"r1",rentalEquipmentLineId:"line 1",assignmentId:"a1",equipmentId:"e1",operatorId:"o1",projectId:"p1",workDate:"2026-08-02",logs:[],totalOperatingMinutes:0,totalIdleMinutes:0,totalMaintenanceMinutes:0,totalMealBreakMinutes:0,totalMobilizationMinutes:0,totalDemobilizationMinutes:0,status:"Submitted",createdAt:"2026-08-02",updatedAt:"2026-08-02"}],
 billing:[{id:"b1",statementNo:"BS-009",invoiceNumber:"INV-100",version:1,rentalId:"r1",rentalNumber:"RNT-2026-0041",equipmentId:"e1",operatorId:"o1",customer:"Acme Builders",project:"Harbor Works",billingFrom:"2026-08-01",billingTo:"2026-08-02",subtotal:1,approvalStatus:"Approved",invoiceStatus:"Invoiced",lines:[],createdBy:"u",createdAt:"2026-08-02"}],
};
const records=buildGlobalSearchRecords(data),allowed=()=>true;
describe("Milestone 6 global search",()=>{
 it.each([["eqp-000023","Equipment"],["cat 320","Equipment"],["maria","Operators"],["acme builders","Customers"],["harbor works","Projects"],["night works","Assignments"],["rnt-2026-0041","Rentals"],["acme","Rentals"],["deur-009","DEUR"],["inv-100","Billing"],["bs-009","Billing"]])("searches %s",(query,type)=>expect(searchGlobalRecords(records,query,allowed).some(x=>x.type===type)).toBe(true));
 it("normalizes case and repeated whitespace and returns no short/no-match results",()=>{expect(searchGlobalRecords(records,"  CAT    320 ",allowed)[0].id).toBe("e1");expect(searchGlobalRecords(records,"x",allowed)).toEqual([]);expect(searchGlobalRecords(records,"missing",allowed)).toEqual([])});
 it("caps each group and omits unauthorized/operator-persona modules",()=>{const many=Array.from({length:7},(_,i)=>({...records[0],id:String(i)}));expect(searchGlobalRecords(many,"cat",allowed)).toHaveLength(5);expect(searchGlobalRecords(records,"acme",p=>p==="rental.read").every(x=>x.type==="Rentals")).toBe(true)});
 it("generates canonical routes",()=>{expect(records.find(x=>x.type==="Equipment")?.href).toBe("/equipment/e1");expect(records.find(x=>x.type==="Rentals")?.href).toBe("/rentals/r1/workspace");expect(records.find(x=>x.type==="DEUR")?.href).toBe("/rentals/r1/operator-deur?lineId=line%201");expect(records.find(x=>x.type==="Billing")?.href).toContain("/rentals/r1/workspace")});
 it("queries only authorized remote repositories with a capped, cancellable request",async()=>{const search=vi.fn().mockResolvedValue({success:true,value:{items:[],total:0}}),repositories=new Proxy({},{get:()=>({search})}) as ApplicationReadRepositories;const controller=new AbortController();await loadRemoteGlobalSearchData(repositories,"acme",p=>p==="customer.read",controller.signal);expect(search).toHaveBeenCalledTimes(1);expect(search).toHaveBeenCalledWith("acme",{paging:{limit:5},signal:controller.signal})});
 it("prevents a stale async result from becoming current",()=>{const guard=createLatestSearchGuard(),first=guard.begin(),second=guard.begin();expect(first()).toBe(false);expect(second()).toBe(true);guard.cancel();expect(second()).toBe(false)});
});
