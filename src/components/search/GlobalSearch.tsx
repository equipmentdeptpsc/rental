import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { operatorEditHref } from "@/features/operators/routing";
import { useCustomer } from "@/features/customer/context/CustomerContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import { billingWorkspaceHref } from "@/features/rental/workspace/routing";
import { useAuth } from "@/features/auth/AuthContext";
import type { Permission } from "@/features/auth/domain/permission";
import { searchGlobalRecords, type GlobalSearchSourceRecord } from "./globalSearchService";

export default function GlobalSearch() {
  const [query,setQuery]=useState(""); const [debounced,setDebounced]=useState(""); const [active,setActive]=useState(-1); const [mobileOpen,setMobileOpen]=useState(false);
  const navigate=useNavigate(); const { hasPermission }=useAuth();
  const { equipment }=useEquipment(); const { operators }=useOperator(); const { customers }=useCustomer(); const { projects }=useProject(); const { rentals }=useRental(); const { assignments }=useAssignment();
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(query),180);return()=>clearTimeout(timer)},[query]);
  const records=useMemo<GlobalSearchSourceRecord[]>(()=>[
    ...equipment.map(e=>({type:"Equipment",id:e.id,title:`${e.assetNo} · ${e.equipmentName}`,subtitle:`${e.category} · ${e.status==="Rented"?"Deployed":e.status}`,searchable:`${e.subcategoryName??""} ${e.projectId}`,href:`/equipment/${e.id}`,permission:"equipment.read"})),
    ...rentals.map(r=>({type:"Rentals",id:r.id,title:r.rentalNumber??"Rental transaction",subtitle:`${r.customer} · ${r.status}`,searchable:`${r.project} ${r.equipmentId}`,href:`/rentals/${r.id}/workspace`,permission:"rental.read"})),
    ...assignments.map(a=>{const eq=equipment.find(e=>e.id===a.equipmentId),project=projects.find(p=>p.id===a.projectId),operator=operators.find(o=>o.id===a.operatorId);return{type:"Assignments",id:a.id,title:`Assignment · ${eq?.assetNo??"Equipment"}`,subtitle:`${project?.projectName??"Project not linked"} · ${a.status}`,searchable:`${eq?.equipmentName??""} ${operator?.name??""} ${a.assignedDate}`,href:`/assignments/${a.id}`,permission:"assignment.read"}}),
    ...customers.map(c=>({type:"Customers",id:c.id,title:c.companyName,subtitle:c.customerCode,searchable:c.contactPerson,href:`/customers/${c.id}`,permission:"customer.read"})),
    ...operators.map(o=>({type:"Operators",id:o.id,title:o.name,subtitle:o.licenseNumber,searchable:o.email,href:operatorEditHref(o.id),permission:"operator.read"})),
    ...projects.map(p=>({type:"Projects",id:p.id,title:p.projectName,subtitle:p.projectCode,searchable:"",href:`/projects/${p.id}/edit`,permission:"project.read"})),
    ...billingStatementRepository.getAll().map(s=>({type:"Billing",id:s.id,title:s.statementNo,subtitle:`${s.customer} · ${s.project}`,searchable:s.rentalId,href:billingWorkspaceHref(s.rentalId,s.id),permission:"billing.read"})),
  ],[assignments,customers,equipment,operators,projects,rentals]);
  const results=useMemo(()=>searchGlobalRecords(records,debounced,p=>hasPermission(p as Permission)),[debounced,hasPermission,records]);
  const groups=Object.entries(results.reduce<Record<string,typeof results>>((all,result)=>{(all[result.type]??=[]).push(result);return all},{}));
  const close=()=>{setQuery("");setDebounced("");setActive(-1);setMobileOpen(false)};
  const choose=(href:string)=>{navigate(href);close()};
  const input=<div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16}/><input autoFocus={mobileOpen} aria-label="Global search" aria-controls="global-search-results" aria-expanded={query.trim().length>=2} className="app-control w-full py-2 pl-9 pr-9 text-xs" placeholder="Search equipment, rentals, customers, projects..." value={query} onChange={e=>{setQuery(e.target.value);setActive(-1)}} onKeyDown={e=>{if(e.key==="Escape")close();else if(e.key==="ArrowDown"){e.preventDefault();setActive(v=>Math.min(v+1,results.length-1))}else if(e.key==="ArrowUp"){e.preventDefault();setActive(v=>Math.max(v-1,0))}else if(e.key==="Enter"&&active>=0){e.preventDefault();choose(results[active].href)}}}/>{query&&<button type="button" aria-label="Clear global search" className="absolute right-2 top-2 rounded p-1 text-slate-500" onClick={close}><X size={16}/></button>}{query.trim().length>=2&&<div id="global-search-results" role="listbox" className="absolute right-0 z-50 mt-1 max-h-[70vh] w-full min-w-[340px] overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">{results.length===0?<p className="p-3 text-sm text-slate-500">No authorized records found.</p>:groups.map(([type,items])=><section key={type} aria-label={`${type} results`}><h3 className="px-2 py-1 text-xs font-semibold uppercase text-slate-500">{type}</h3>{items.map(item=>{const index=results.indexOf(item);return <button role="option" aria-selected={active===index} type="button" key={`${item.type}:${item.id}`} onMouseEnter={()=>setActive(index)} onClick={()=>choose(item.href)} className={`block w-full rounded-md p-2 text-left ${active===index?"bg-blue-50 text-blue-950 dark:bg-blue-950 dark:text-blue-50":"hover:bg-slate-100 dark:hover:bg-slate-800"}`}><strong className="block text-sm">{item.title}</strong><span className="block text-xs text-slate-500 dark:text-slate-400">{item.subtitle}</span></button>})}</section>)}</div>}</div>;
  return <><div className="hidden sm:block">{input}</div><button type="button" aria-label="Open global search" className="rounded-md p-2 sm:hidden" onClick={()=>setMobileOpen(true)}><Search size={19}/></button>{mobileOpen&&<div role="dialog" aria-modal="true" aria-label="Global search" className="fixed inset-0 z-[70] bg-white p-4 dark:bg-slate-950 sm:hidden"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Global Search</h2><button aria-label="Close global search" onClick={close}><X/></button></div>{input}</div>}</>;
}
