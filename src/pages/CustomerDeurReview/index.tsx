import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { useRental } from "@/features/rental/context/RentalContext";
import { useCustomer } from "@/features/customer/context/CustomerContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";

export default function CustomerDeurReviewPage(){
  const {deurId=""}=useParams(); const [version,setVersion]=useState(0); const [reason,setReason]=useState(""); const [remarks,setRemarks]=useState(""); const [message,setMessage]=useState("");
  const {rentals,rentalEquipmentLines}=useRental(),{customers}=useCustomer(),{projects}=useProject(),{equipment}=useEquipment(),{operators}=useOperator();
  const deur=deurRepository.getById(deurId); const rental=rentals.find(item=>item.id===deur?.rentalId); const line=rentalEquipmentLines.find(item=>item.id===deur?.rentalEquipmentLineId); const customer=customers.find(item=>item.id===rental?.customerId); const project=projects.find(item=>item.id===rental?.projectId); const machine=equipment.find(item=>item.id===line?.equipmentId); const operator=operators.find(item=>item.id===line?.operatorId);
  void version;
  if(!deur||!rental)return <main className="p-6">Customer review record was not found.</main>;
  const actor={id:customer?.id,name:customer?.contactPerson||customer?.companyName||rental.customer,email:customer?.email};
  const decide=(decision:"acknowledge"|"reject")=>{const result=decision==="acknowledge"?deurRepository.acknowledge(deur.id,actor,remarks):deurRepository.reject(deur.id,actor,reason);setMessage(result.success?decision==="acknowledge"?"DEUR acknowledged. It is now eligible for Billing.":"Correction requested. Billing remains blocked.":result.message);if(result.success)setVersion(value=>value+1);};
  const totals=deur.totals;
  return <main className="mx-auto max-w-3xl space-y-5 p-6">
    <header><Link className="text-sm text-blue-700" to={`/rentals/${rental.id}/workspace`}>← Rental Workspace</Link><h1 className="mt-2 text-2xl font-bold">Customer DEUR Review</h1><p className="rounded bg-amber-50 p-2 text-xs text-amber-900">UAT local review access. This is not a production-secure customer link.</p></header>
    <section className="rounded-xl border bg-white p-5"><dl className="grid gap-3 sm:grid-cols-2"><Item label="DEUR" value={deur.deurNumber??"Number unavailable"}/><Item label="Revision" value={`R${deur.revision?.revisionNumber??1}`}/><Item label="Rental" value={rental.rentalNumber??"Number unavailable"}/><Item label="Customer" value={customer?.companyName??rental.customer}/><Item label="Project" value={project?`${project.projectName} (${project.projectCode})`:rental.project}/><Item label="Equipment" value={machine?`${machine.equipmentName} (${machine.assetNo})`:"Equipment unavailable"}/><Item label="Operator" value={operator?.name??"Operator not assigned"}/><Item label="Work Date" value={deur.workDate}/><Item label="Shift" value={deur.shift??"Not specified"}/><Item label="Work Description" value={deur.operationalMetadata?.workDescription?.name??"Not captured"}/><Item label="Submitted" value={deur.submittedAt?new Date(deur.submittedAt).toLocaleString():"Not recorded"}/><Item label="Status" value={deur.status}/></dl><div className="mt-4 rounded bg-slate-50 p-3 text-sm">Operation: {totals?.operationMinutes??deur.totalOperatingMinutes} min · Idle: {totals?.idleMinutes??deur.totalIdleMinutes} min · Breakdown: {totals?.breakdownMinutes??deur.totalMaintenanceMinutes} min</div></section>
    {deur.status==="Submitted"?<section className="space-y-3 rounded-xl border bg-white p-5"><label className="block text-sm">Acknowledgement remarks (optional)<textarea className="mt-1 block w-full rounded border p-2" value={remarks} onChange={event=>setRemarks(event.target.value)}/></label><button className="rounded bg-emerald-700 px-4 py-2 font-medium text-white" onClick={()=>decide("acknowledge")}>Acknowledge</button><label className="block text-sm">Rejection / correction reason<textarea className="mt-1 block w-full rounded border p-2" value={reason} onChange={event=>setReason(event.target.value)}/></label><button className="rounded border border-red-600 px-4 py-2 font-medium text-red-700" onClick={()=>decide("reject")}>Reject / Request Correction</button></section>:<p className="rounded bg-slate-100 p-4">This DEUR is not awaiting a Customer decision. Current status: {deur.status}.</p>}
    {message&&<p role="status" className="rounded bg-blue-50 p-3 text-blue-900">{message}</p>}
  </main>;
}
function Item({label,value}:{label:string;value:string}){return <div><dt className="text-xs uppercase text-slate-500">{label}</dt><dd>{value}</dd></div>}
