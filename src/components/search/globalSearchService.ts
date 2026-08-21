import type { ApplicationReadRepositories } from "@/app/composition/ApplicationDependencies";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { CustomerRecord } from "@/features/customer/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import { operatorEditHref } from "@/features/operators/routing";
import type { ProjectRecord } from "@/features/project/types";
import type { BillingStatement } from "@/features/rental/billingstatement/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import { buildOperatorDeurLineUrl } from "@/features/rental/deur/operator/resolveOperatorDeurRouteLine";
import type { RentalRecord } from "@/features/rental/types";
import { billingWorkspaceHref } from "@/features/rental/workspace/routing";

export interface GlobalSearchSourceRecord { type: string; id: string; title: string; subtitle: string; href: string; searchable: string; permission: string }
export interface GlobalSearchResult { type: string; id: string; title: string; subtitle: string; href: string }
export interface GlobalSearchData { equipment: readonly EquipmentRecord[]; operators: readonly Operator[]; customers: readonly CustomerRecord[]; projects: readonly ProjectRecord[]; assignments: readonly AssignmentRecord[]; rentals: readonly RentalRecord[]; deurs: readonly DeurRecord[]; billing: readonly BillingStatement[] }

export function normalizeGlobalSearchText(value: string): string { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase(); }

export function buildGlobalSearchRecords(data: GlobalSearchData): GlobalSearchSourceRecord[] {
  return [
    ...data.equipment.map(e=>({type:"Equipment",id:e.id,title:`${e.equipmentName} / ${e.assetNo}`,subtitle:`${e.category} · ${e.status==="Rented"?"Deployed":e.status}`,searchable:`${e.assetNo} ${e.equipmentName} ${e.serialNumber??""} ${e.subcategoryName??""}`,href:`/equipment/${e.id}`,permission:"equipment.read"})),
    ...data.operators.map(o=>({type:"Operators",id:o.id,title:`${o.licenseNumber} / ${o.name}`,subtitle:o.status,searchable:`${o.email} ${o.certificationType}`,href:operatorEditHref(o.id),permission:"operator.read"})),
    ...data.customers.map(c=>({type:"Customers",id:c.id,title:c.companyName,subtitle:c.customerCode,searchable:`${c.contactPerson} ${c.email} ${c.contactNumber}`,href:`/customers/${c.id}`,permission:"customer.read"})),
    ...data.projects.map(p=>({type:"Projects",id:p.id,title:p.projectName,subtitle:p.projectCode,searchable:`${p.location} ${p.projectManager}`,href:`/projects/${p.id}/edit`,permission:"project.read"})),
    ...data.assignments.map(a=>{const eq=data.equipment.find(e=>e.id===a.equipmentId),project=data.projects.find(p=>p.id===a.projectId),operator=data.operators.find(o=>o.id===a.operatorId);return{type:"Assignments",id:a.id,title:`Assignment · ${eq?.assetNo??"Equipment"}`,subtitle:`${project?.projectName??"Project not linked"} · ${a.status}`,searchable:`${eq?.equipmentName??""} ${operator?.name??""} ${a.assignedDate} ${a.remarks}`,href:`/assignments/${a.id}`,permission:"assignment.read"}}),
    ...data.rentals.map(r=>({type:"Rentals",id:r.id,title:r.rentalNumber??"Rental transaction",subtitle:`${r.customer} · ${r.status}`,searchable:`${r.customer} ${r.project} ${r.rentalNumber??""}`,href:`/rentals/${r.id}/workspace`,permission:"rental.read"})),
    ...data.deurs.map(d=>({type:"DEUR",id:d.id,title:d.deurNumber??"DEUR",subtitle:`${d.workDate} · ${d.status}`,searchable:`${d.deurNumber??""} ${d.operationalRemarks??""}`,href:d.rentalEquipmentLineId?buildOperatorDeurLineUrl(d.rentalId,d.rentalEquipmentLineId):`/rentals/${encodeURIComponent(d.rentalId)}/operator-deur`,permission:"deur.read"})),
    ...data.billing.map(s=>({type:"Billing",id:s.id,title:s.invoiceNumber?.trim()||s.statementNo,subtitle:`${s.customer} · ${s.project}`,searchable:`${s.statementNo} ${s.invoiceNumber??""} ${s.rentalNumber??""} ${s.customer} ${s.project}`,href:billingWorkspaceHref(s.rentalId,s.id),permission:"billing.read"})),
  ];
}

export function searchGlobalRecords(records: readonly GlobalSearchSourceRecord[], query: string, canRead: (permission: string) => boolean, limitPerGroup = 5): GlobalSearchResult[] {
  const keyword = normalizeGlobalSearchText(query);
  if (keyword.length < 2) return [];
  const counts = new Map<string, number>();
  return records.filter((record) => canRead(record.permission) && normalizeGlobalSearchText(`${record.title} ${record.subtitle} ${record.searchable}`).includes(keyword)).filter((record) => {
    const count = counts.get(record.type) ?? 0;
    if (count >= limitPerGroup) return false;
    counts.set(record.type, count + 1);
    return true;
  }).map(({ type, id, title, subtitle, href }) => ({ type, id, title, subtitle, href }));
}

const remoteSearches = [["equipment","equipment.read"],["operators","operator.read"],["customers","customer.read"],["projects","project.read"],["assignments","assignment.read"],["rentals","rental.read"],["deurs","deur.read"],["billing","billing.read"]] as const;
export async function loadRemoteGlobalSearchData(repositories:ApplicationReadRepositories,query:string,canRead:(permission:string)=>boolean,signal:AbortSignal):Promise<{data:GlobalSearchData;hasError:boolean}>{
  const data:GlobalSearchData={equipment:[],operators:[],customers:[],projects:[],assignments:[],rentals:[],deurs:[],billing:[]};let hasError=false;
  const permitted=remoteSearches.filter(([,permission])=>canRead(permission));
  const settled=await Promise.allSettled(permitted.map(async([key])=>[key,await repositories[key].search(query,{paging:{limit:5},signal})] as const));
  for(const item of settled){if(item.status==="rejected"||!item.value[1].success){hasError=true;continue}const[key,result]=item.value;(data as unknown as Record<string,unknown>)[key]=result.value.items}
  return{data,hasError};
}
export function createLatestSearchGuard(){let sequence=0;return{begin(){const current=++sequence;return()=>current===sequence},cancel(){sequence+=1}}}
